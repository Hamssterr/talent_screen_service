import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Evaluation } from '../entities/evaluation.entity';
import { EvaluationType } from '../enums/evaluation-type.enum';
import { Interview } from '../../interviews/entities/interview.entity';
import { EvaluationResponseDto } from '../dto/evaluation-response.dto';

@Injectable()
export class EvaluationsService {
  constructor(
    @InjectRepository(Evaluation)
    private readonly evaluationRepository: Repository<Evaluation>,
    @InjectRepository(Interview)
    private readonly interviewRepository: Repository<Interview>,
  ) {}

  /**
   * Lấy danh sách các evaluations (HR review & AI summary) của một buổi phỏng vấn.
   */
  async getEvaluations(
    interviewId: string,
    type?: EvaluationType,
  ): Promise<EvaluationResponseDto[]> {
    const where: { interviewId: string; type?: EvaluationType } = {
      interviewId,
    };
    if (type) {
      where.type = type;
    }

    const evaluations = await this.evaluationRepository.find({
      where,
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
