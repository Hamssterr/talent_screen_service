import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { InterviewSession } from '../entities/interview-session.entity';
import { InterviewTurn } from '../entities/interview-turn.entity';
import { InterviewQuestion } from '../../interviews/entities/interview-question.entity';
import { Interview } from '../../interviews/entities/interview.entity';
import { TurnKind } from '../enums/turn-kind.enum';
import { TurnStatus } from '../enums/turn-status.enum';
import { RuntimeState } from '../enums/runtime-state.enum';
import { SessionStatus } from '../enums/session-status.enum';
import { AiService } from '../../ai/ai.service';
import { AiRunService } from '../../ai/services/ai-run.service';
import { AiTask } from '../../ai/enums/ai-task.enum';
import { computeInputHash } from '../../ai/utils/input-hash.util';
import {
  FOLLOW_UP_PROMPT_VERSION,
  FOLLOW_UP_SCHEMA_VERSION,
} from '../../ai/tasks/follow-up/follow-up.prompt';
import {
  FollowUpBranchTurn,
  FollowUpOutput,
} from '../../ai/tasks/follow-up/follow-up-ai.types';
import { validateFollowUpProposal } from '../../ai/tasks/follow-up/follow-up.validator';
import { StructuredGenerationResult } from '../../ai/contracts/structured-generation.types';
import { AuditService } from '../../../platform/audit/audit.service';
import { ErrorCodes } from '../../../common/errors/error-codes';

export interface FollowUpDecisionContext {
  shouldCallAi: boolean;
  reason?: string;
  interview?: Interview | null;
  session: InterviewSession;
  currentTurn: InterviewTurn;
  rootQuestion?: InterviewQuestion | null;
  branchTurns: FollowUpBranchTurn[];
  remainingRootBudget: number;
  remainingSessionBudget: number;
}

@Injectable()
export class FollowUpAiService {
  private readonly logger = new Logger(FollowUpAiService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly aiService: AiService,
    private readonly aiRunService: AiRunService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Kiểm tra xem câu trả lời vừa submit có đủ điều kiện để kích hoạt AI Follow-up hay không.
   */
  async evaluateEligibility(
    session: InterviewSession,
    turn: InterviewTurn,
    answerText: string | null,
    isSkipped: boolean,
    now: Date,
    manager: EntityManager,
  ): Promise<FollowUpDecisionContext> {
    const interviewRepo = manager.getRepository(Interview);
    const questionRepo = manager.getRepository(InterviewQuestion);
    const turnRepo = manager.getRepository(InterviewTurn);

    const interview = await interviewRepo.findOne({
      where: { id: session.interviewId },
    });

    if (!interview) {
      return {
        shouldCallAi: false,
        reason: 'INTERVIEW_NOT_FOUND',
        interview: null,
        session,
        currentTurn: turn,
        rootQuestion: null,
        branchTurns: [],
        remainingRootBudget: 0,
        remainingSessionBudget: 0,
      };
    }

    // 1. Không gọi nếu là Skip hoặc text rỗng
    if (isSkipped || !answerText || answerText.trim().length === 0) {
      return {
        shouldCallAi: false,
        reason: 'ANSWER_SKIPPED_OR_EMPTY',
        interview,
        session,
        currentTurn: turn,
        rootQuestion: null,
        branchTurns: [],
        remainingRootBudget: 0,
        remainingSessionBudget: 0,
      };
    }

    // 2. Không gọi nếu Session không còn in_progress
    if (session.status !== SessionStatus.IN_PROGRESS) {
      return {
        shouldCallAi: false,
        reason: 'SESSION_NOT_IN_PROGRESS',
        interview,
        session,
        currentTurn: turn,
        rootQuestion: null,
        branchTurns: [],
        remainingRootBudget: 0,
        remainingSessionBudget: 0,
      };
    }

    // 3. Lấy Root Question
    const rootQuestion = await questionRepo.findOne({
      where: { id: turn.rootQuestionId },
    });

    if (!rootQuestion) {
      return {
        shouldCallAi: false,
        reason: 'ROOT_QUESTION_NOT_FOUND',
        interview,
        session,
        currentTurn: turn,
        rootQuestion: null,
        branchTurns: [],
        remainingRootBudget: 0,
        remainingSessionBudget: 0,
      };
    }

    // 4. Kiểm tra Root question policy (allowFollowUp & maxFollowUps)
    if (!rootQuestion.allowFollowUp || rootQuestion.maxFollowUps <= 0) {
      return {
        shouldCallAi: false,
        reason: 'ROOT_QUESTION_FOLLOW_UP_DISABLED',
        interview,
        session,
        currentTurn: turn,
        rootQuestion,
        branchTurns: [],
        remainingRootBudget: 0,
        remainingSessionBudget: 0,
      };
    }

    // Đếm số follow-up turns đã tạo trong branch này
    const followUpsInBranch = await turnRepo.count({
      where: {
        sessionId: session.id,
        rootQuestionId: rootQuestion.id,
        kind: TurnKind.FOLLOW_UP,
      },
    });

    const remainingRootBudget = rootQuestion.maxFollowUps - followUpsInBranch;
    if (remainingRootBudget <= 0) {
      return {
        shouldCallAi: false,
        reason: 'ROOT_BUDGET_EXHAUSTED',
        interview,
        session,
        currentTurn: turn,
        rootQuestion,
        branchTurns: [],
        remainingRootBudget: 0,
        remainingSessionBudget: 0,
      };
    }

    // 5. Kiểm tra Session budget (Interview.maxFollowUpsTotal vs followUpsUsed)
    const maxFollowUpsTotal = interview.maxFollowUpsTotal || 0;
    const remainingSessionBudget = maxFollowUpsTotal - session.followUpsUsed;

    if (remainingSessionBudget <= 0) {
      return {
        shouldCallAi: false,
        reason: 'SESSION_BUDGET_EXHAUSTED',
        interview,
        session,
        currentTurn: turn,
        rootQuestion,
        branchTurns: [],
        remainingRootBudget,
        remainingSessionBudget: 0,
      };
    }

    // 6. Kiểm tra Deadline: Phải còn đủ thời gian an toàn cho AI timeout
    const minRemainingMs = this.configService.get<number>(
      'ai.followUpMinRemainingMs',
      20000,
    );
    const msUntilDeadline = session.deadlineAt.getTime() - now.getTime();

    if (msUntilDeadline < minRemainingMs) {
      return {
        shouldCallAi: false,
        reason: 'INSUFFICIENT_TIME_BEFORE_DEADLINE',
        interview,
        session,
        currentTurn: turn,
        rootQuestion,
        branchTurns: [],
        remainingRootBudget,
        remainingSessionBudget,
      };
    }

    // 7. Lấy lịch sử các Turn trong branch này để gửi prompt
    const branchTurnsEntities = await turnRepo.find({
      where: {
        sessionId: session.id,
        rootQuestionId: rootQuestion.id,
      },
      relations: { answer: true },
      order: { sequenceNo: 'ASC' },
    });

    const branchTurns: FollowUpBranchTurn[] = branchTurnsEntities.map((bt) => ({
      id: bt.id,
      kind: bt.kind === TurnKind.MAIN ? 'main' : 'follow_up',
      sequenceNo: bt.sequenceNo,
      text: bt.text,
      answerText: bt.id === turn.id ? answerText : bt.answer?.text || null,
      isSkipped: bt.id === turn.id ? isSkipped : bt.answer?.isSkipped || false,
    }));

    return {
      shouldCallAi: true,
      interview,
      session,
      currentTurn: turn,
      rootQuestion,
      branchTurns,
      remainingRootBudget,
      remainingSessionBudget,
    };
  }

  /**
   * Tạo AiRun và chuẩn bị advanceDeadlineAt cho Transaction 1
   */
  async prepareAdvancingRun(
    manager: EntityManager,
    context: FollowUpDecisionContext,
    now: Date,
  ): Promise<{ advanceDeadlineAt: Date; aiRunId: string }> {
    const timeoutMs = this.configService.get<number>(
      'ai.followUpTimeoutMs',
      15000,
    );
    const graceMs = this.configService.get<number>(
      'ai.followUpRecoveryGraceMs',
      5000,
    );

    // advanceDeadlineAt = now + timeout + grace, nhưng không được vượt quá session.deadlineAt
    const calculatedAdvanceDeadline = new Date(
      now.getTime() + timeoutMs + graceMs,
    );
    const advanceDeadlineAt =
      calculatedAdvanceDeadline > context.session.deadlineAt
        ? context.session.deadlineAt
        : calculatedAdvanceDeadline;

    const inputHash = computeInputHash({
      rootQuestionId: context.rootQuestion?.id || '',
      currentTurnId: context.currentTurn.id,
      remainingRootBudget: context.remainingRootBudget,
      remainingSessionBudget: context.remainingSessionBudget,
    });

    const modelName =
      this.configService.get<string>('ai.geminiModel')?.trim() ||
      'gemini-3.5-flash-lite';

    const aiRun = await this.aiRunService.start(manager, {
      task: AiTask.FOLLOW_UP,
      model: modelName,
      aggregateType: 'interview_session',
      aggregateId: context.session.id,
      promptVersion: FOLLOW_UP_PROMPT_VERSION,
      schemaVersion: FOLLOW_UP_SCHEMA_VERSION,
      inputHash,
    });

    return {
      advanceDeadlineAt,
      aiRunId: aiRun.id,
    };
  }

  /**
   * Điều phối việc gọi Gemini ngoài transaction và apply Follow-up ở Transaction 2.
   * Nếu Gemini timeout/lỗi/sai schema/trùng lặp -> Fallback deterministic sang câu hỏi chính tiếp theo.
   */
  async executeFollowUpWorkflow(params: {
    context: FollowUpDecisionContext;
    aiRunId: string;
    expectedSessionVersion: number;
    parentTurnId: string;
    answerText: string;
  }): Promise<void> {
    const {
      context,
      aiRunId,
      expectedSessionVersion,
      parentTurnId,
      answerText,
    } = params;

    if (!context.interview || !context.rootQuestion) {
      return;
    }

    let aiResult: StructuredGenerationResult<FollowUpOutput>;
    try {
      // Gọi AiService ngoài transaction
      aiResult = await this.aiService.suggestFollowUp({
        rootQuestionText: context.rootQuestion.text,
        competency: context.rootQuestion.competency,
        evaluationCriterionDescription:
          context.rootQuestion.evaluationCriterionId || null,
        branchTurns: context.branchTurns,
        currentAnswerText: answerText,
        remainingRootBudget: context.remainingRootBudget,
        remainingSessionBudget: context.remainingSessionBudget,
        language: context.interview.language,
      });
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.warn(
        `[FollowUp] Gemini call failed for session=${context.session.id}: ${err.message}. Falling back to next main.`,
      );

      await this.applyFallbackNextMain(
        context.session.id,
        aiRunId,
        expectedSessionVersion,
        context.currentTurn.sequenceNo,
        context.rootQuestion.position,
        ErrorCodes.FOLLOW_UP_GENERATION_FAILED,
      );
      return;
    }

    // Validate Follow-up proposal
    const existingBranchTexts = context.branchTurns.map((t) => t.text);
    const validation = validateFollowUpProposal(
      aiResult.data,
      context.rootQuestion.text,
      existingBranchTexts,
    );

    if (!validation.isValid) {
      this.logger.warn(
        `[FollowUp] Invalid AI proposal: ${validation.errorMessage}. Falling back to next main.`,
      );

      await this.applyFallbackNextMain(
        context.session.id,
        aiRunId,
        expectedSessionVersion,
        context.currentTurn.sequenceNo,
        context.rootQuestion.position,
        validation.errorCode || ErrorCodes.FOLLOW_UP_INVALID_OUTPUT,
      );
      return;
    }

    // --- TRANSACTION 2: APPLY KẾT QUẢ ---
    await this.applyAiResultTransaction({
      sessionId: context.session.id,
      interviewId: context.interview.id,
      aiRunId,
      expectedSessionVersion,
      output: aiResult.data,
      rootQuestionId: context.rootQuestion.id,
      rootQuestionPosition: context.rootQuestion.position,
      parentTurnId,
      lastSequenceNo: context.currentTurn.sequenceNo,
      maxFollowUpsTotal: context.interview.maxFollowUpsTotal,
      rootMaxFollowUps: context.rootQuestion.maxFollowUps,
      latencyMs: aiResult.latencyMs,
      inputTokens: aiResult.inputTokens,
      outputTokens: aiResult.outputTokens,
    });
  }

  /**
   * Transaction 2: Lock Session, kiểm tra expected version & apply follow-up hoặc next main
   */
  private async applyAiResultTransaction(params: {
    sessionId: string;
    interviewId: string;
    aiRunId: string;
    expectedSessionVersion: number;
    output: FollowUpOutput;
    rootQuestionId: string;
    rootQuestionPosition: number;
    parentTurnId: string;
    lastSequenceNo: number;
    maxFollowUpsTotal: number;
    rootMaxFollowUps: number;
    latencyMs: number;
    inputTokens?: number;
    outputTokens?: number;
  }): Promise<void> {
    await this.dataSource.transaction(async (manager: EntityManager) => {
      const sessionRepo = manager.getRepository(InterviewSession);
      const turnRepo = manager.getRepository(InterviewTurn);

      const session = await sessionRepo
        .createQueryBuilder('s')
        .setLock('pessimistic_write')
        .where('s.id = :id', { id: params.sessionId })
        .getOne();

      if (!session) {
        return;
      }

      const now = new Date();

      // Kiểm tra Late Result & Version
      if (
        session.status !== SessionStatus.IN_PROGRESS ||
        session.runtimeState !== RuntimeState.ADVANCING ||
        session.version !== params.expectedSessionVersion
      ) {
        this.logger.warn(
          `[FollowUp] Late result ignored for session=${session.id}. Status=${session.status}, state=${session.runtimeState}, expectedVer=${params.expectedSessionVersion}, currentVer=${session.version}`,
        );
        await this.aiRunService.supersede(manager, params.aiRunId);
        return;
      }

      // Kiểm tra advanceDeadlineAt chưa hết hạn
      if (session.advanceDeadlineAt && now >= session.advanceDeadlineAt) {
        this.logger.warn(
          `[FollowUp] Result arrived after advanceDeadlineAt for session=${session.id}. Superseding run.`,
        );
        await this.aiRunService.supersede(manager, params.aiRunId);
        return;
      }

      // Nếu AI đề xuất ASK
      if (params.output.action === 'ask' && params.output.question) {
        // Re-check budgets trong transaction
        const followUpsInBranch = await turnRepo.count({
          where: {
            sessionId: session.id,
            rootQuestionId: params.rootQuestionId,
            kind: TurnKind.FOLLOW_UP,
          },
        });

        const rootBudgetOk = followUpsInBranch < params.rootMaxFollowUps;
        const sessionBudgetOk =
          session.followUpsUsed < params.maxFollowUpsTotal;

        if (rootBudgetOk && sessionBudgetOk) {
          // Tạo Turn FOLLOW_UP
          const nextSequenceNo = params.lastSequenceNo + 1;
          const followUpTurn = turnRepo.create({
            sessionId: session.id,
            rootQuestionId: params.rootQuestionId,
            parentTurnId: params.parentTurnId,
            sequenceNo: nextSequenceNo,
            kind: TurnKind.FOLLOW_UP,
            followUpIndex: followUpsInBranch + 1,
            text: params.output.question,
            status: TurnStatus.OPEN,
            presentedAt: now,
            closedAt: null,
            aiRunId: params.aiRunId,
          });

          const savedTurn = await turnRepo.save(followUpTurn);

          session.currentTurnId = savedTurn.id;
          session.currentTurn = savedTurn;
          session.runtimeState = RuntimeState.AWAITING_ANSWER;
          session.advanceDeadlineAt = null;
          session.followUpsUsed += 1;
          session.version += 1;

          await sessionRepo.save(session);

          // Mark AiRun SUCCEEDED
          await this.aiRunService.succeed(manager, params.aiRunId, {
            latencyMs: params.latencyMs,
            inputTokens: params.inputTokens,
            outputTokens: params.outputTokens,
          });

          // Audit
          await this.auditService.record(
            {
              actorId: null,
              actorType: 'system',
              action: 'interview.follow_up_created',
              targetType: 'interview_turn',
              targetId: savedTurn.id,
              metadata: {
                sessionId: session.id,
                interviewId: params.interviewId,
                sequenceNo: savedTurn.sequenceNo,
                followUpIndex: savedTurn.followUpIndex,
                aiRunId: params.aiRunId,
              },
            },
            manager,
          );

          return;
        }

        // Nếu budget vừa hết trước Transaction 2 -> chuyển sang continue
        this.logger.log(
          `[FollowUp] Budget exhausted before applying ask for session=${session.id}. Advancing to next main.`,
        );
      }

      // Nếu AI đề xuất CONTINUE hoặc budget đã hết -> Mở câu hỏi chính tiếp theo
      await this.openNextMainQuestion(
        session,
        params.rootQuestionPosition,
        params.lastSequenceNo,
        now,
        manager,
      );

      session.advanceDeadlineAt = null;
      session.version += 1;
      await sessionRepo.save(session);

      await this.aiRunService.succeed(manager, params.aiRunId, {
        latencyMs: params.latencyMs,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
      });

      await this.auditService.record(
        {
          actorId: null,
          actorType: 'system',
          action: 'interview.follow_up_skipped_by_policy',
          targetType: 'interview_session',
          targetId: session.id,
          metadata: {
            sessionId: session.id,
            interviewId: params.interviewId,
            reason:
              params.output.action === 'continue'
                ? 'ai_continue'
                : 'budget_exhausted',
            aiRunId: params.aiRunId,
          },
        },
        manager,
      );
    });
  }

  /**
   * Fallback sang câu hỏi chính tiếp theo khi AI gặp sự cố (Transaction riêng biệt)
   */
  async applyFallbackNextMain(
    sessionId: string,
    aiRunId: string,
    expectedSessionVersion: number,
    lastSequenceNo: number,
    rootQuestionPosition: number,
    errorCode: string,
  ): Promise<void> {
    try {
      await this.dataSource.transaction(async (manager: EntityManager) => {
        const sessionRepo = manager.getRepository(InterviewSession);
        const session = await sessionRepo
          .createQueryBuilder('s')
          .setLock('pessimistic_write')
          .where('s.id = :id', { id: sessionId })
          .getOne();

        if (!session) {
          return;
        }

        // Nếu version hoặc state đã thay đổi, không can thiệp
        if (
          session.status !== SessionStatus.IN_PROGRESS ||
          session.runtimeState !== RuntimeState.ADVANCING ||
          session.version !== expectedSessionVersion
        ) {
          await this.aiRunService.supersede(manager, aiRunId);
          return;
        }

        const now = new Date();
        await this.openNextMainQuestion(
          session,
          rootQuestionPosition,
          lastSequenceNo,
          now,
          manager,
        );

        session.advanceDeadlineAt = null;
        session.version += 1;
        await sessionRepo.save(session);

        await this.aiRunService.fail(manager, aiRunId, errorCode);

        await this.auditService.record(
          {
            actorId: null,
            actorType: 'system',
            action: 'interview.follow_up_failed_fallback',
            targetType: 'interview_session',
            targetId: session.id,
            metadata: {
              sessionId: session.id,
              interviewId: session.interviewId,
              errorCode,
              aiRunId,
            },
          },
          manager,
        );
      });
    } catch (e: unknown) {
      const err = e as Error;
      this.logger.error(
        `[FollowUp] Error during fallback for session=${sessionId}: ${err.message}`,
      );
    }
  }

  /**
   * Helper tìm và mở câu hỏi chính kế tiếp (hoặc set READY_TO_FINISH nếu hết)
   */
  private async openNextMainQuestion(
    session: InterviewSession,
    currentPosition: number,
    lastSequenceNo: number,
    now: Date,
    manager: EntityManager,
  ): Promise<void> {
    const turnRepo = manager.getRepository(InterviewTurn);
    const questionRepo = manager.getRepository(InterviewQuestion);

    const nextPosition = currentPosition + 1;
    const nextQuestion = await questionRepo.findOne({
      where: {
        interviewId: session.interviewId,
        position: nextPosition,
      },
    });

    if (nextQuestion) {
      const nextTurn = turnRepo.create({
        sessionId: session.id,
        rootQuestionId: nextQuestion.id,
        parentTurnId: null,
        sequenceNo: lastSequenceNo + 1,
        kind: TurnKind.MAIN,
        followUpIndex: 0,
        text: nextQuestion.text,
        status: TurnStatus.OPEN,
        presentedAt: now,
        closedAt: null,
        aiRunId: null,
      });

      const savedNextTurn = await turnRepo.save(nextTurn);
      session.currentTurnId = savedNextTurn.id;
      session.currentTurn = savedNextTurn;
      session.runtimeState = RuntimeState.AWAITING_ANSWER;
    } else {
      session.currentTurnId = null;
      session.currentTurn = null;
      session.runtimeState = RuntimeState.READY_TO_FINISH;
    }
  }
}
