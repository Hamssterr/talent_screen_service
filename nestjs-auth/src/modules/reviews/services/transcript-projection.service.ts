import { Injectable, NotFoundException } from '@nestjs/common';
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
import { ErrorCodes } from '../../../common/errors/error-codes';

@Injectable()
export class TranscriptProjectionService {
  constructor(
    @InjectRepository(Interview)
    private readonly interviewRepository: Repository<Interview>,
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
  async getTranscript(interviewId: string): Promise<TranscriptResponseDto> {
    const interview = await this.interviewRepository.findOne({
      where: { id: interviewId },
    });

    if (!interview) {
      throw new NotFoundException({
        code: ErrorCodes.INTERVIEW_NOT_FOUND,
        message: 'Không tìm thấy buổi phỏng vấn',
      });
    }

    const session = await this.sessionRepository.findOne({
      where: { interviewId },
    });

    if (!session) {
      return {
        interviewId,
        sessionId: null,
        sessionStatus: null,
        endReason: null,
        startedAt: null,
        endedAt: null,
        turns: [],
      };
    }

    const turns = await this.turnRepository.find({
      where: { sessionId: session.id },
      relations: { answer: true },
      order: { sequenceNo: 'ASC' },
    });

    const questions = await this.questionRepository.find({
      where: { interviewId },
    });
    const questionMap = new Map<string, InterviewQuestion>();
    for (const q of questions) {
      questionMap.set(q.id, q);
    }

    const projectedTurns: TranscriptTurnDto[] = turns.map((turn) => {
      const rootQ = questionMap.get(turn.rootQuestionId);
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

    return {
      interviewId,
      sessionId: session.id,
      sessionStatus: session.status,
      endReason: session.endReason,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
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
