import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Evaluation } from '../entities/evaluation.entity';
import { EvaluationType } from '../enums/evaluation-type.enum';
import { Interview } from '../../interviews/entities/interview.entity';
import { InterviewSession } from '../../interview-runtime/entities/interview-session.entity';
import { InterviewTurn } from '../../interview-runtime/entities/interview-turn.entity';
import { SessionStatus } from '../../interview-runtime/enums/session-status.enum';
import { ApplicationStatus } from '../../applications/enums/application-status.enum';
import { isApplicationTerminal } from '../../applications/policies/application-terminal.policy';
import { CreateHrReviewDto } from '../dto/create-hr-review.dto';
import { EvaluationResponseDto } from '../dto/evaluation-response.dto';
import { EvaluationsService } from './evaluations.service';
import { ReviewAccessPolicy } from './review-access.policy';
import { AuditService } from '../../../platform/audit/audit.service';
import { IdempotencyService } from '../../../platform/idempotency/idempotency.service';
import { ErrorCodes } from '../../../common/errors/error-codes';
import { ActorContext } from '../../../common/context/actor-context';

@Injectable()
export class HrReviewService {
  private readonly logger = new Logger(HrReviewService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly reviewAccessPolicy: ReviewAccessPolicy,
    private readonly evaluationsService: EvaluationsService,
    private readonly auditService: AuditService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  /**
   * Tạo bản đánh giá chính thức của HR (HR Review) cho buổi phỏng vấn đã hoàn tất.
   */
  async createHrReview(
    interviewId: string,
    dto: CreateHrReviewDto,
    actor: ActorContext,
    idempotencyKey?: string,
  ): Promise<EvaluationResponseDto> {
    if (!idempotencyKey || !idempotencyKey.trim()) {
      throw new BadRequestException({
        code: ErrorCodes.VALIDATION_FAILED,
        message: 'Header Idempotency-Key là bắt buộc khi tạo HR Review',
      });
    }

    const actorScope = `user:${actor.userId}:hr-review:${interviewId}`;

    const executed = await this.idempotencyService.execute({
      actorScope,
      route: 'POST:/api/v1/interviews/:id/hr-reviews',
      key: idempotencyKey,
      method: 'POST',
      body: { interviewId, dto },
      action: async () => {
        // 1. Kiểm tra Interview tồn tại và quyền truy cập (Resource Hiding 404)
        const interview =
          await this.reviewAccessPolicy.getAccessibleInterviewOrThrow(
            interviewId,
            actor,
          );

        // 2. Kiểm tra Session phải ở trạng thái terminal
        const session = await this.dataSource
          .getRepository(InterviewSession)
          .findOne({
            where: { interviewId: interview.id },
          });

        if (!session) {
          throw new ConflictException({
            code: ErrorCodes.SESSION_NOT_STARTED,
            message: 'Buổi phỏng vấn chưa bắt đầu, không thể tạo đánh giá HR',
          });
        }

        const isTerminalSession =
          session.status === SessionStatus.COMPLETED ||
          session.status === SessionStatus.EXPIRED ||
          session.status === SessionStatus.CANCELLED;

        if (!isTerminalSession) {
          throw new ConflictException({
            code: ErrorCodes.INTERVIEW_NOT_TERMINAL,
            message:
              'Buổi phỏng vấn chưa kết thúc. Chỉ có thể tạo HR Review sau khi buổi phỏng vấn hoàn tất.',
          });
        }

        // 3. Kiểm tra Application status: không được terminal và phải là under_review
        const appStatus = interview.application.status;
        if (isApplicationTerminal(appStatus)) {
          throw new ConflictException({
            code: ErrorCodes.APPLICATION_TERMINAL,
            message:
              'Hồ sơ ứng tuyển đã ở trạng thái kết thúc, không thể tạo thêm đánh giá HR.',
          });
        }

        if (appStatus !== ApplicationStatus.UNDER_REVIEW) {
          throw new ConflictException({
            code: ErrorCodes.APPLICATION_NOT_UNDER_REVIEW,
            message:
              'Hồ sơ ứng tuyển chưa ở trạng thái under_review, không thể tạo đánh giá HR.',
          });
        }

        // 4. Validate basedOnAiSummaryId nếu có
        if (dto.basedOnAiSummaryId) {
          const aiSummary = await this.dataSource
            .getRepository(Evaluation)
            .findOne({
              where: {
                id: dto.basedOnAiSummaryId,
                interviewId: interview.id,
                sessionId: session.id,
                type: EvaluationType.AI_SUMMARY,
              },
            });

          if (!aiSummary) {
            throw new UnprocessableEntityException({
              code: ErrorCodes.AI_SUMMARY_REFERENCE_INVALID,
              message:
                'Bản AI Summary tham chiếu không tồn tại hoặc không thuộc buổi phỏng vấn này.',
            });
          }
        }

        // 5. Validate bằng chứng evidenceTurnIds
        const turns = await this.dataSource.getRepository(InterviewTurn).find({
          where: { sessionId: session.id },
          relations: { answer: true },
        });

        const turnMap = new Map<string, InterviewTurn>();
        for (const t of turns) {
          turnMap.set(t.id, t);
        }

        const allEvidenceTurnIds = new Set<string>();
        for (const s of dto.strengths) {
          for (const tid of s.evidenceTurnIds || []) {
            allEvidenceTurnIds.add(tid);
          }
        }
        for (const g of dto.gaps) {
          for (const tid of g.evidenceTurnIds || []) {
            allEvidenceTurnIds.add(tid);
          }
        }
        for (const c of dto.criterionAssessments) {
          for (const tid of c.evidenceTurnIds || []) {
            allEvidenceTurnIds.add(tid);
          }
        }

        for (const tid of allEvidenceTurnIds) {
          const turn = turnMap.get(tid);
          if (!turn) {
            throw new UnprocessableEntityException({
              code: ErrorCodes.HR_REVIEW_INVALID_EVIDENCE,
              message: `Bằng chứng turnId "${tid}" không tồn tại trong buổi phỏng vấn này.`,
            });
          }
          if (
            turn.answer?.isSkipped ||
            !turn.answer?.text ||
            !turn.answer.text.trim()
          ) {
            throw new UnprocessableEntityException({
              code: ErrorCodes.HR_REVIEW_INVALID_EVIDENCE,
              message: `Bằng chứng turnId "${tid}" không hợp lệ do ứng viên đã bỏ qua hoặc chưa trả lời.`,
            });
          }
        }

        // 6. Validate criterionAssessments với Job Snapshot
        const jobSnapshot = (interview.jobSnapshot || {}) as Record<
          string,
          any
        >;
        const validCriteria = Array.isArray(jobSnapshot.evaluationCriteria)
          ? (jobSnapshot.evaluationCriteria as Array<{ id?: string }>)
          : [];
        const validCriterionIds = new Set(
          validCriteria
            .map((c) => (typeof c.id === 'string' ? c.id : ''))
            .filter((id) => Boolean(id)),
        );

        const assessedCriterionIds = new Set<string>();
        for (const c of dto.criterionAssessments) {
          if (
            validCriterionIds.size > 0 &&
            !validCriterionIds.has(c.criterionId)
          ) {
            throw new UnprocessableEntityException({
              code: ErrorCodes.CRITERION_ASSESSMENT_INVALID,
              message: `Tiêu chí "${c.criterionId}" không tồn tại trong danh sách tiêu chí của vị trí tuyển dụng.`,
            });
          }
          if (assessedCriterionIds.has(c.criterionId)) {
            throw new UnprocessableEntityException({
              code: ErrorCodes.CRITERION_ASSESSMENT_INVALID,
              message: `Tiêu chí "${c.criterionId}" bị đánh giá trùng lặp.`,
            });
          }
          assessedCriterionIds.add(c.criterionId);
        }

        // 7. Transaction lưu Evaluation type HR_REVIEW
        let savedReview!: Evaluation;
        await this.dataSource.transaction(async (manager) => {
          // Lock Interview row pessimistic_write
          await manager
            .getRepository(Interview)
            .createQueryBuilder('i')
            .setLock('pessimistic_write')
            .where('i.id = :id', { id: interview.id })
            .getOne();

          const evalRepo = manager.getRepository(Evaluation);

          const latestHrReview = await evalRepo
            .createQueryBuilder('e')
            .where('e.interview_id = :interviewId', {
              interviewId: interview.id,
            })
            .andWhere('e.type = :type', { type: EvaluationType.HR_REVIEW })
            .orderBy('e.revision', 'DESC')
            .getOne();

          const nextRevision = (latestHrReview?.revision || 0) + 1;

          const evaluation = evalRepo.create({
            ownerId: interview.ownerId,
            interviewId: interview.id,
            sessionId: session.id,
            type: EvaluationType.HR_REVIEW,
            revision: nextRevision,
            schemaVersion: 1,
            content: {
              overallAssessment: dto.overallAssessment,
              strengths: dto.strengths,
              gaps: dto.gaps,
              criterionAssessments: dto.criterionAssessments,
              basedOnAiSummaryId: dto.basedOnAiSummaryId || null,
            },
            createdBy: actor.userId,
          });

          savedReview = await evalRepo.save(evaluation);

          // Audit log
          await this.auditService.record(
            {
              actorId: actor.userId,
              actorType: 'user',
              action: 'interview.hr_review_created',
              targetType: 'evaluation',
              targetId: savedReview.id,
              metadata: {
                interviewId: interview.id,
                sessionId: session.id,
                revision: nextRevision,
                basedOnAiSummaryId: dto.basedOnAiSummaryId || null,
              },
            },
            manager,
          );
        });

        const responseDto = this.evaluationsService.toResponseDto(savedReview);
        return {
          status: 201,
          body: responseDto,
        };
      },
    });

    return executed.body;
  }
}
