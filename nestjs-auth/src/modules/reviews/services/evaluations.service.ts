import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Evaluation } from '../entities/evaluation.entity';
import { Interview } from '../../interviews/entities/interview.entity';
import { EvaluationResponseDto } from '../dto/evaluation-response.dto';
import { ErrorCodes } from '../../../common/errors/error-codes';

@Injectable()
export class EvaluationsService {
  constructor(
    @InjectRepository(Evaluation)
    private readonly evaluationRepository: Repository<Evaluation>,
    @InjectRepository(Interview)
    private readonly interviewRepository: Repository<Interview>,
  ) {}

  /**
   * Lấy danh sách toàn bộ các evaluations (HR review & AI summary) của một buổi phỏng vấn.
   */
  async getEvaluations(interviewId: string): Promise<EvaluationResponseDto[]> {
    const interview = await this.interviewRepository.findOne({
      where: { id: interviewId },
    });

    if (!interview) {
      throw new NotFoundException({
        code: ErrorCodes.INTERVIEW_NOT_FOUND,
        message: 'Không tìm thấy buổi phỏng vấn',
      });
    }

    const evaluations = await this.evaluationRepository.find({
      where: { interviewId },
      order: { createdAt: 'DESC', revision: 'DESC' },
    });

    return evaluations.map((e) => this.toResponseDto(e));
  }

  /**
   * Chuyển đổi entity Evaluation sang DTO phản hồi.
   */
  toResponseDto(evaluation: Evaluation): EvaluationResponseDto {
    return {
      id: evaluation.id,
      interviewId: evaluation.interviewId,
      sessionId: evaluation.sessionId,
      type: evaluation.type,
      revision: evaluation.revision,
      schemaVersion: evaluation.schemaVersion,
      content: evaluation.content,
      aiRunId: evaluation.aiRunId,
      inputHash: evaluation.inputHash,
      createdBy: evaluation.createdBy,
      createdAt: evaluation.createdAt,
    };
  }
}
