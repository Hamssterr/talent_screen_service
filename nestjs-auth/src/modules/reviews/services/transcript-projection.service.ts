import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Interview } from '../../interviews/entities/interview.entity';
import { InterviewSession } from '../../interview-runtime/entities/interview-session.entity';
import { InterviewTurn } from '../../interview-runtime/entities/interview-turn.entity';
import { InterviewQuestion } from '../../interviews/entities/interview-question.entity';
import { TurnKind } from '../../interview-runtime/enums/turn-kind.enum';
import {
  TranscriptResponseDto,
  TranscriptTurnDto,
} from '../dto/transcript-response.dto';
import { SummaryTranscriptTurn } from '../../ai/tasks/summary/summary-ai.types';

@Injectable()
export class TranscriptProjectionService {
  constructor(
    @InjectRepository(InterviewSession)
    private readonly sessionRepository: Repository<InterviewSession>,
    @InjectRepository(InterviewTurn)
    private readonly turnRepository: Repository<InterviewTurn>,
    @InjectRepository(InterviewQuestion)
    private readonly questionRepository: Repository<InterviewQuestion>,
  ) {}

  /**
   * Tải toàn bộ transcript của buổi phỏng vấn theo đúng trình tự sequenceNo.
   */
  async getTranscript(interview: Interview): Promise<TranscriptResponseDto> {
    const questions = await this.questionRepository.find({
      where: { interviewId: interview.id },
      order: { position: 'ASC' },
    });
    const mainTotal = questions.length;

    const baseCoverage = {
      mainTotal,
      mainAnswered: 0,
      mainSkipped: 0,
      mainUnanswered: mainTotal,
      followUpsTotal: 0,
      followUpsAnswered: 0,
      followUpsSkipped: 0,
    };

    const session = await this.sessionRepository.findOne({
      where: { interviewId: interview.id },
    });

    if (!session) {
      return {
        interviewId: interview.id,
        applicationId: interview.applicationId,
        roundNo: interview.roundNo,
        cvVersionId: interview.cvVersionId,
        deadlineAt: interview.invitationExpiresAt,
        jobSnapshot: (interview.jobSnapshot as Record<string, any>) || null,
        profileSnapshot:
          (interview.profileSnapshot as Record<string, any>) || null,
        sessionId: null,
        sessionStatus: null,
        endReason: null,
        startedAt: null,
        endedAt: null,
        coverage: baseCoverage,
        turns: [],
      };
    }

    const turns = await this.turnRepository.find({
      where: { sessionId: session.id },
      relations: { answer: true },
      order: { sequenceNo: 'ASC' },
    });

    const questionMap = new Map<string, InterviewQuestion>();
    for (const q of questions) {
      questionMap.set(q.id, q);
    }

    let mainAnswered = 0;
    let mainSkipped = 0;
    let followUpsTotal = 0;
    let followUpsAnswered = 0;
    let followUpsSkipped = 0;

    const answeredRootQuestions = new Set<string>();

    const projectedTurns: TranscriptTurnDto[] = turns.map((turn) => {
      const rootQ = questionMap.get(turn.rootQuestionId);
      const isMain = turn.kind === TurnKind.MAIN;
      const isFollowUp = turn.kind === TurnKind.FOLLOW_UP;

      if (isMain) {
        if (turn.answer) {
          if (turn.answer.isSkipped) {
            mainSkipped += 1;
          } else if (turn.answer.text && turn.answer.text.trim()) {
            mainAnswered += 1;
            answeredRootQuestions.add(turn.rootQuestionId);
          }
        }
      } else if (isFollowUp) {
        followUpsTotal += 1;
        if (turn.answer) {
          if (turn.answer.isSkipped) {
            followUpsSkipped += 1;
          } else if (turn.answer.text && turn.answer.text.trim()) {
            followUpsAnswered += 1;
          }
        }
      }

      return {
        turnId: turn.id,
        sequenceNo: turn.sequenceNo,
        kind: turn.kind,
        rootQuestionId: turn.rootQuestionId,
        parentTurnId: turn.parentTurnId,
        questionText: turn.text,
        competency: rootQ?.competency || null,
        evaluationCriterionId: rootQ?.evaluationCriterionId || null,
        status: turn.status,
        presentedAt: turn.presentedAt,
        closedAt: turn.closedAt,
        answer: turn.answer
          ? {
              text: turn.answer.text,
              isSkipped: turn.answer.isSkipped,
              submittedAt: turn.answer.submittedAt,
            }
          : null,
      };
    });

    const mainUnanswered = Math.max(0, mainTotal - mainAnswered - mainSkipped);

    return {
      interviewId: interview.id,
      applicationId: interview.applicationId,
      roundNo: interview.roundNo,
      cvVersionId: interview.cvVersionId,
      deadlineAt: interview.invitationExpiresAt,
      jobSnapshot: (interview.jobSnapshot as Record<string, any>) || null,
      profileSnapshot:
        (interview.profileSnapshot as Record<string, any>) || null,
      sessionId: session.id,
      sessionStatus: session.status,
      endReason: session.endReason,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      coverage: {
        mainTotal,
        mainAnswered,
        mainSkipped,
        mainUnanswered,
        followUpsTotal,
        followUpsAnswered,
        followUpsSkipped,
      },
      turns: projectedTurns,
    };
  }

  /**
   * Chuyển đổi các turn đã trả lời/skip thành dữ liệu đầu vào cho AI Summary.
   */
  async buildAiSummaryTurns(
    sessionId: string,
  ): Promise<SummaryTranscriptTurn[]> {
    const turns = await this.turnRepository.find({
      where: { sessionId },
      relations: { answer: true },
      order: { sequenceNo: 'ASC' },
    });

    const rootQuestionIds = Array.from(
      new Set(turns.map((t) => t.rootQuestionId)),
    );
    const questionMap = new Map<string, InterviewQuestion>();

    if (rootQuestionIds.length > 0) {
      const questions = await this.questionRepository.find({
        where: { id: In(rootQuestionIds) },
      });
      for (const q of questions) {
        questionMap.set(q.id, q);
      }
    }

    return turns.map((turn) => {
      const rootQ = questionMap.get(turn.rootQuestionId);
      return {
        turnId: turn.id,
        rootQuestionId: turn.rootQuestionId,
        rootQuestionText: rootQ?.text || turn.text,
        competency: rootQ?.competency || null,
        evaluationCriterionId: rootQ?.evaluationCriterionId || null,
        kind: turn.kind === TurnKind.MAIN ? 'main' : 'follow_up',
        sequenceNo: turn.sequenceNo,
        questionText: turn.text,
        answerText: turn.answer?.text || null,
        isSkipped: turn.answer?.isSkipped || false,
      };
    });
  }
}
