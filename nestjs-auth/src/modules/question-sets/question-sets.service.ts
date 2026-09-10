import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { QuestionSet } from './entities/question-set.entity';
import { QuestionSetItem } from './entities/question-set-item.entity';
import { Application } from '../applications/entities/application.entity';
import { ApplicationStatus } from '../applications/enums/application-status.enum';
import { CvVersion } from '../documents/entities/cv-version.entity';
import { CvProfileStatus } from '../documents/enums/cv-profile-status.enum';
import { Job } from '../jobs/entities/job.entity';
import { CreateQuestionSetDto } from './dto/create-question-set.dto';
import { UpdateQuestionSetItemsDto } from './dto/update-question-set-items.dto';
import { ApproveQuestionSetDto } from './dto/approve-question-set.dto';
import { ListQuestionSetsQueryDto } from './dto/list-question-sets-query.dto';
import {
  QuestionSetDetailDto,
  QuestionSetItemResponseDto,
  QuestionSetSummaryDto,
} from './dto/question-set-response.dto';
import { QuestionSetStatus } from './enums/question-set-status.enum';
import { QuestionSetMode } from './enums/question-set-mode.enum';
import { QuestionSource } from './enums/question-source.enum';
import { QuestionDifficulty } from './enums/question-difficulty.enum';
import { QuestionLanguage } from './enums/question-language.enum';
import { AuditService } from '../../platform/audit/audit.service';
import { PermissionsService } from '../admin/permissions/permissions.service';
import { Permissions } from '../admin/permissions/permissions.constants';
import { ActorContext } from '../../common/context/actor-context';
import {
  createPaginationResult,
  PaginatedResult,
} from '../../common/dto/pagination.dto';
import { VersionConflictException } from '../../common/dto/expected-version.dto';
import { ErrorCodes } from '../../common/errors/error-codes';

@Injectable()
export class QuestionSetsService {
  private readonly logger = new Logger(QuestionSetsService.name);

  constructor(
    @InjectRepository(QuestionSet)
    private readonly questionSetRepository: Repository<QuestionSet>,
    @InjectRepository(QuestionSetItem)
    private readonly questionSetItemRepository: Repository<QuestionSetItem>,
    @InjectRepository(Application)
    private readonly applicationRepository: Repository<Application>,
    @InjectRepository(CvVersion)
    private readonly cvVersionRepository: Repository<CvVersion>,
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
    private readonly dataSource: DataSource,
    private readonly permissionsService: PermissionsService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Tạo Question Set thủ công (draft) cho một Application
   */
  async createManualDraft(
    actor: ActorContext,
    applicationId: string,
    dto: CreateQuestionSetDto,
  ): Promise<QuestionSetDetailDto> {
    const isAppAdmin = await this.permissionsService.hasAll(actor.userId, [
      Permissions.QuestionSetsManage,
    ]);

    // 1. Kiểm tra Application
    const application = await this.applicationRepository.findOne({
      where: { id: applicationId },
      relations: { job: true },
    });

    if (!application || application.deletedAt) {
      throw new NotFoundException({
        code: ErrorCodes.APPLICATION_NOT_FOUND,
        message: 'Hồ sơ ứng tuyển không tồn tại',
      });
    }

    if (!isAppAdmin && application.ownerId !== actor.userId) {
      throw new NotFoundException({
        code: ErrorCodes.APPLICATION_NOT_FOUND,
        message: 'Hồ sơ ứng tuyển không tồn tại',
      });
    }

    if (application.status !== ApplicationStatus.SHORTLISTED) {
      throw new ConflictException({
        code: ErrorCodes.APPLICATION_STATE_CONFLICT,
        message: 'Chỉ được tạo bộ câu hỏi cho hồ sơ có trạng thái shortlisted',
      });
    }

    if (
      !application.currentCvVersionId ||
      application.currentCvVersionId !== dto.cvVersionId
    ) {
      throw new BadRequestException({
        code: ErrorCodes.CV_NOT_FOUND,
        message:
          'cvVersionId không trùng khớp với CV hiện tại của hồ sơ ứng tuyển',
      });
    }

    // 2. Kiểm tra CvVersion
    const cvVersion = await this.cvVersionRepository.findOne({
      where: { id: dto.cvVersionId, applicationId: application.id },
    });

    if (!cvVersion || cvVersion.deletedAt) {
      throw new NotFoundException({
        code: ErrorCodes.CV_NOT_FOUND,
        message: 'Phiên bản CV không tồn tại',
      });
    }

    if (cvVersion.profileStatus !== CvProfileStatus.APPROVED) {
      throw new ConflictException({
        code: ErrorCodes.CV_PROFILE_NOT_APPROVED,
        message: 'Hồ sơ trích xuất CV (profile) chưa được phê duyệt',
      });
    }

    if (
      !cvVersion.profileJson ||
      (cvVersion.profileJson as unknown as Record<string, unknown>)
        .schemaVersion !== 'profile.v1'
    ) {
      throw new BadRequestException({
        code: ErrorCodes.CV_PROFILE_NOT_READY,
        message: 'Dữ liệu CV profile chưa đúng cấu trúc schema profile.v1',
      });
    }

    // 3. Kiểm tra Job
    const job = await this.jobRepository.findOne({
      where: { id: application.jobId },
    });

    if (!job || job.deletedAt) {
      throw new NotFoundException({
        code: ErrorCodes.JOB_NOT_FOUND,
        message: 'Vị trí công việc không tồn tại',
      });
    }

    // 4. Tạo snapshot dữ liệu an toàn
    const profileSnapshot = {
      ...(cvVersion.profileJson as unknown as Record<string, unknown>),
    };

    const jobSnapshot: Record<string, unknown> = {
      jobId: job.id,
      title: job.title,
      description: job.description,
      requiredSkills: job.requiredSkills || [],
      evaluationCriteria: job.evaluationCriteria || [],
      version: job.version,
    };

    const questionSet = this.questionSetRepository.create({
      ownerId: application.ownerId,
      applicationId: application.id,
      cvVersionId: cvVersion.id,
      cvProfileVersion: cvVersion.profileVersion,
      jobVersion: job.version,
      profileSnapshot,
      jobSnapshot,
      language: dto.language || QuestionLanguage.VI,
      mode: QuestionSetMode.MANUAL,
      status: QuestionSetStatus.DRAFT,
      version: 1,
      generationVersion: 1,
    });

    const saved = await this.questionSetRepository.save(questionSet);

    // Ghi nhận Audit Log
    await this.auditService.record({
      actorId: actor.userId,
      actorType: 'user',
      action: 'question-sets.create',
      targetType: 'question_set',
      targetId: saved.id,
      ownerId: saved.ownerId,
      metadata: {
        applicationId: saved.applicationId,
        cvVersionId: saved.cvVersionId,
        mode: saved.mode,
        language: saved.language,
      },
      requestId: actor.requestId,
    });

    return this.mapToDetailDto(saved, [], false);
  }

  /**
   * Danh sách Question Sets của Application (Offset-based pagination)
   */
  async listByApplication(
    actor: ActorContext,
    applicationId: string,
    query: ListQuestionSetsQueryDto,
  ): Promise<PaginatedResult<QuestionSetSummaryDto>> {
    const isAppAdmin = await this.permissionsService.hasAll(actor.userId, [
      Permissions.QuestionSetsManage,
    ]);

    const application = await this.applicationRepository.findOne({
      where: { id: applicationId },
    });

    if (!application || application.deletedAt) {
      throw new NotFoundException({
        code: ErrorCodes.APPLICATION_NOT_FOUND,
        message: 'Hồ sơ ứng tuyển không tồn tại',
      });
    }

    const job = await this.jobRepository.findOne({
      where: { id: application.jobId },
    });

    const isAppOwner = application.ownerId === actor.userId;
    const isJobOwner = job && job.ownerId === actor.userId;

    if (!isAppAdmin && !isAppOwner && !isJobOwner) {
      throw new NotFoundException({
        code: ErrorCodes.APPLICATION_NOT_FOUND,
        message: 'Hồ sơ ứng tuyển không tồn tại',
      });
    }

    const qb = this.questionSetRepository
      .createQueryBuilder('qs')
      .leftJoin('qs.items', 'item')
      .select('qs')
      .addSelect('COUNT(item.id)', 'itemCount')
      .where('qs.application_id = :applicationId', { applicationId })
      .andWhere('qs.deleted_at IS NULL')
      .groupBy('qs.id')
      .orderBy('qs.created_at', 'DESC')
      .addOrderBy('qs.id', 'DESC')
      .skip(query.skip)
      .take(query.limit ?? 10);

    const rawAndEntities = await qb.getRawAndEntities();
    const totalItems = await this.questionSetRepository.count({
      where: { applicationId },
    });

    // Lấy CV Version hiện tại để tính stale
    let currentCvVersion: CvVersion | null = null;
    if (application.currentCvVersionId) {
      currentCvVersion = await this.cvVersionRepository.findOne({
        where: { id: application.currentCvVersionId },
      });
    }

    const summaries: QuestionSetSummaryDto[] = rawAndEntities.entities.map(
      (entity, index) => {
        const raw = rawAndEntities.raw[index] as
          { itemCount?: string | number } | undefined;
        const itemCount = parseInt(String(raw?.itemCount ?? 0), 10);

        const isStale = this.checkIfStale(
          entity,
          application,
          currentCvVersion,
          job,
        );

        return this.mapToSummaryDto(entity, itemCount, isStale);
      },
    );

    return createPaginationResult(summaries, totalItems, query);
  }

  /**
   * Chi tiết Question Set theo ID
   */
  async findOne(
    actor: ActorContext,
    id: string,
  ): Promise<QuestionSetDetailDto> {
    const isAppAdmin = await this.permissionsService.hasAll(actor.userId, [
      Permissions.QuestionSetsManage,
    ]);

    const questionSet = await this.questionSetRepository.findOne({
      where: { id },
      relations: { application: true },
    });

    if (!questionSet || questionSet.deletedAt || !questionSet.application) {
      throw new NotFoundException({
        code: ErrorCodes.QUESTION_SET_NOT_FOUND,
        message: 'Question Set không tồn tại',
      });
    }

    const application = questionSet.application;
    const job = await this.jobRepository.findOne({
      where: { id: application.jobId },
    });

    const isAppOwner = questionSet.ownerId === actor.userId;
    const isJobOwner = job && job.ownerId === actor.userId;

    if (!isAppAdmin && !isAppOwner && !isJobOwner) {
      throw new NotFoundException({
        code: ErrorCodes.QUESTION_SET_NOT_FOUND,
        message: 'Question Set không tồn tại',
      });
    }

    const items = await this.questionSetItemRepository.find({
      where: { questionSetId: questionSet.id },
      order: { position: 'ASC' },
    });

    let currentCvVersion: CvVersion | null = null;
    if (application.currentCvVersionId) {
      currentCvVersion = await this.cvVersionRepository.findOne({
        where: { id: application.currentCvVersionId },
      });
    }

    const isStale = this.checkIfStale(
      questionSet,
      application,
      currentCvVersion,
      job,
    );

    return this.mapToDetailDto(questionSet, items, isStale);
  }

  /**
   * Thay thế toàn bộ items của Question Set (Transaction & Optimistic Locking)
   */
  async updateItems(
    actor: ActorContext,
    id: string,
    dto: UpdateQuestionSetItemsDto,
  ): Promise<QuestionSetDetailDto> {
    const isAppAdmin = await this.permissionsService.hasAll(actor.userId, [
      Permissions.QuestionSetsManage,
    ]);

    return await this.dataSource.transaction(async (manager) => {
      const qsRepo = manager.getRepository(QuestionSet);
      const itemRepo = manager.getRepository(QuestionSetItem);

      // Lock row FOR UPDATE để tránh race conditions
      const questionSet = await qsRepo
        .createQueryBuilder('qs')
        .setLock('pessimistic_write')
        .where('qs.id = :id', { id })
        .andWhere('qs.deleted_at IS NULL')
        .getOne();

      if (!questionSet) {
        throw new NotFoundException({
          code: ErrorCodes.QUESTION_SET_NOT_FOUND,
          message: 'Question Set không tồn tại',
        });
      }

      if (!isAppAdmin && questionSet.ownerId !== actor.userId) {
        throw new NotFoundException({
          code: ErrorCodes.QUESTION_SET_NOT_FOUND,
          message: 'Question Set không tồn tại',
        });
      }

      if (questionSet.status === QuestionSetStatus.APPROVED) {
        throw new ConflictException({
          code: ErrorCodes.QUESTION_SET_ALREADY_APPROVED,
          message: 'Question Set đã được phê duyệt, không thể chỉnh sửa',
        });
      }

      if (questionSet.status !== QuestionSetStatus.DRAFT) {
        throw new ConflictException({
          code: ErrorCodes.QUESTION_SET_NOT_EDITABLE,
          message: 'Chỉ có thể chỉnh sửa Question Set khi ở trạng thái draft',
        });
      }

      // Kiểm tra Optimistic Concurrency Control
      if (questionSet.version !== dto.expectedVersion) {
        throw new VersionConflictException(
          `Version conflict: expected ${dto.expectedVersion}, but actual is ${questionSet.version}`,
        );
      }

      // Validate Items: 1..12 câu
      if (!dto.items || dto.items.length < 1 || dto.items.length > 12) {
        throw new BadRequestException({
          code: ErrorCodes.QUESTION_SET_INVALID_ITEMS,
          message: 'Số lượng câu hỏi phải từ 1 đến 12',
        });
      }

      // Validate Positions: 1..N liên tục không trùng
      const sortedItems = [...dto.items].sort(
        (a, b) => a.position - b.position,
      );
      for (let i = 0; i < sortedItems.length; i++) {
        if (sortedItems[i].position !== i + 1) {
          throw new BadRequestException({
            code: ErrorCodes.QUESTION_SET_INVALID_ITEMS,
            message: `Thứ tự vị trí câu hỏi không hợp lệ: vị trí phải bắt đầu từ 1 và liên tục (thiếu position ${i + 1})`,
          });
        }
      }

      // Validate evaluationCriterionId nếu có trong Job snapshot
      const validCriteriaIds = new Set<string>();
      if (
        questionSet.jobSnapshot &&
        Array.isArray(questionSet.jobSnapshot.evaluationCriteria)
      ) {
        for (const c of questionSet.jobSnapshot.evaluationCriteria as Array<{
          id: string;
        }>) {
          if (c && c.id) validCriteriaIds.add(c.id);
        }
      }

      for (const item of dto.items) {
        if (
          item.evaluationCriterionId &&
          !validCriteriaIds.has(item.evaluationCriterionId)
        ) {
          throw new BadRequestException({
            code: ErrorCodes.EVALUATION_CRITERION_NOT_FOUND,
            message: `evaluationCriterionId "${item.evaluationCriterionId}" không thuộc danh sách tiêu chí của Job`,
          });
        }
      }

      // Xoá toàn bộ items cũ
      await itemRepo.delete({ questionSetId: questionSet.id });

      // Tạo các items mới
      const newItems = sortedItems.map((item) =>
        itemRepo.create({
          questionSetId: questionSet.id,
          position: item.position,
          text: item.text.trim(),
          source: QuestionSource.MANUAL,
          competency: item.competency?.trim() || null,
          evaluationCriterionId: item.evaluationCriterionId || null,
          difficulty: item.difficulty || QuestionDifficulty.INTERMEDIATE,
          allowFollowUp: item.allowFollowUp ?? true,
          maxFollowUps: item.maxFollowUps ?? 1,
          evidenceRefs: item.evidenceRefs || null,
          reviewNotes: item.reviewNotes?.trim() || null,
        }),
      );

      const savedItems = await itemRepo.save(newItems);

      // Tăng version của QuestionSet
      questionSet.version += 1;
      const updatedSet = await qsRepo.save(questionSet);

      // Ghi Audit log
      await this.auditService.record(
        {
          actorId: actor.userId,
          actorType: 'user',
          action: 'question-sets.update-items',
          targetType: 'question_set',
          targetId: updatedSet.id,
          ownerId: updatedSet.ownerId,
          metadata: {
            previousVersion: dto.expectedVersion,
            newVersion: updatedSet.version,
            itemCount: savedItems.length,
          },
          requestId: actor.requestId,
        },
        manager,
      );

      return this.mapToDetailDto(updatedSet, savedItems, false);
    });
  }

  /**
   * Phê duyệt Question Set (Approve)
   */
  async approve(
    actor: ActorContext,
    id: string,
    dto: ApproveQuestionSetDto,
  ): Promise<QuestionSetDetailDto> {
    const isAppAdmin = await this.permissionsService.hasAll(actor.userId, [
      Permissions.QuestionSetsManage,
    ]);

    return await this.dataSource.transaction(async (manager) => {
      const qsRepo = manager.getRepository(QuestionSet);
      const itemRepo = manager.getRepository(QuestionSetItem);
      const appRepo = manager.getRepository(Application);
      const cvRepo = manager.getRepository(CvVersion);
      const jobRepo = manager.getRepository(Job);

      const questionSet = await qsRepo
        .createQueryBuilder('qs')
        .setLock('pessimistic_write')
        .where('qs.id = :id', { id })
        .andWhere('qs.deleted_at IS NULL')
        .getOne();

      if (!questionSet) {
        throw new NotFoundException({
          code: ErrorCodes.QUESTION_SET_NOT_FOUND,
          message: 'Question Set không tồn tại',
        });
      }

      if (!isAppAdmin && questionSet.ownerId !== actor.userId) {
        throw new NotFoundException({
          code: ErrorCodes.QUESTION_SET_NOT_FOUND,
          message: 'Question Set không tồn tại',
        });
      }

      if (questionSet.status === QuestionSetStatus.APPROVED) {
        throw new ConflictException({
          code: ErrorCodes.QUESTION_SET_ALREADY_APPROVED,
          message: 'Question Set đã được phê duyệt trước đó',
        });
      }

      if (questionSet.status !== QuestionSetStatus.DRAFT) {
        throw new ConflictException({
          code: ErrorCodes.QUESTION_SET_NOT_EDITABLE,
          message: 'Chỉ có thể phê duyệt Question Set khi ở trạng thái draft',
        });
      }

      if (questionSet.version !== dto.expectedVersion) {
        throw new VersionConflictException(
          `Version conflict: expected ${dto.expectedVersion}, but actual is ${questionSet.version}`,
        );
      }

      // Kiểm tra stale với Application, CV Version và Job thực tế
      const application = await appRepo.findOne({
        where: { id: questionSet.applicationId },
      });

      if (!application || application.deletedAt) {
        throw new NotFoundException({
          code: ErrorCodes.APPLICATION_NOT_FOUND,
          message: 'Hồ sơ ứng tuyển không tồn tại',
        });
      }

      const job = await jobRepo.findOne({
        where: { id: application.jobId },
      });

      let currentCvVersion: CvVersion | null = null;
      if (application.currentCvVersionId) {
        currentCvVersion = await cvRepo.findOne({
          where: { id: application.currentCvVersionId },
        });
      }

      const isStale = this.checkIfStale(
        questionSet,
        application,
        currentCvVersion,
        job,
      );

      if (isStale) {
        throw new ConflictException({
          code: ErrorCodes.QUESTION_SET_STALE,
          message:
            'Question Set đã bị cũ (stale) do CV hoặc Job đã có phiên bản mới hơn. Vui lòng clone hoặc tạo bộ câu hỏi mới',
        });
      }

      // Kiểm tra items (1..12 câu)
      const items = await itemRepo.find({
        where: { questionSetId: questionSet.id },
        order: { position: 'ASC' },
      });

      if (!items || items.length === 0) {
        throw new BadRequestException({
          code: ErrorCodes.QUESTION_SET_EMPTY,
          message:
            'Không thể phê duyệt Question Set rỗng. Vui lòng thêm ít nhất 1 câu hỏi',
        });
      }

      if (items.length > 12) {
        throw new BadRequestException({
          code: ErrorCodes.QUESTION_SET_INVALID_ITEMS,
          message: 'Question Set vượt quá số lượng tối đa cho phép (12 câu)',
        });
      }

      // Kiểm tra liên tục position
      for (let i = 0; i < items.length; i++) {
        if (items[i].position !== i + 1) {
          throw new BadRequestException({
            code: ErrorCodes.QUESTION_SET_INVALID_ITEMS,
            message: `Thứ tự vị trí câu hỏi không liên tục (thiếu position ${i + 1})`,
          });
        }
      }

      // Cập nhật trạng thái phê duyệt & tăng version
      questionSet.status = QuestionSetStatus.APPROVED;
      questionSet.approvedBy = actor.userId;
      questionSet.approvedAt = new Date();
      questionSet.version += 1;

      const approvedSet = await qsRepo.save(questionSet);

      // Ghi Audit Log
      await this.auditService.record(
        {
          actorId: actor.userId,
          actorType: 'user',
          action: 'question-sets.approve',
          targetType: 'question_set',
          targetId: approvedSet.id,
          ownerId: approvedSet.ownerId,
          metadata: {
            previousVersion: dto.expectedVersion,
            newVersion: approvedSet.version,
            itemCount: items.length,
            approvedAt: approvedSet.approvedAt,
          },
          requestId: actor.requestId,
        },
        manager,
      );

      return this.mapToDetailDto(approvedSet, items, false);
    });
  }

  /**
   * Clone Question Set sang một draft mới độc lập
   */
  async clone(actor: ActorContext, id: string): Promise<QuestionSetDetailDto> {
    const isAppAdmin = await this.permissionsService.hasAll(actor.userId, [
      Permissions.QuestionSetsManage,
    ]);

    return await this.dataSource.transaction(async (manager) => {
      const qsRepo = manager.getRepository(QuestionSet);
      const itemRepo = manager.getRepository(QuestionSetItem);

      const sourceSet = await qsRepo.findOne({
        where: { id },
        relations: { application: true },
      });

      if (!sourceSet || sourceSet.deletedAt || !sourceSet.application) {
        throw new NotFoundException({
          code: ErrorCodes.QUESTION_SET_NOT_FOUND,
          message: 'Question Set nguồn không tồn tại',
        });
      }

      const isAppOwner = sourceSet.ownerId === actor.userId;
      if (!isAppAdmin && !isAppOwner) {
        throw new NotFoundException({
          code: ErrorCodes.QUESTION_SET_NOT_FOUND,
          message: 'Question Set nguồn không tồn tại',
        });
      }

      // Lấy items của source set
      const sourceItems = await itemRepo.find({
        where: { questionSetId: sourceSet.id },
        order: { position: 'ASC' },
      });

      // Tạo new QuestionSet với status=draft, version=1, sourceQuestionSetId=id
      const newQuestionSet = qsRepo.create({
        ownerId: sourceSet.ownerId,
        applicationId: sourceSet.applicationId,
        cvVersionId: sourceSet.cvVersionId,
        cvProfileVersion: sourceSet.cvProfileVersion,
        jobVersion: sourceSet.jobVersion,
        profileSnapshot: sourceSet.profileSnapshot,
        jobSnapshot: sourceSet.jobSnapshot,
        language: sourceSet.language,
        mode: sourceSet.mode,
        status: QuestionSetStatus.DRAFT,
        version: 1,
        generationVersion: sourceSet.generationVersion,
        aiRunId: null,
        sourceQuestionSetId: sourceSet.id,
        approvedBy: null,
        approvedAt: null,
      });

      const savedSet = await qsRepo.save(newQuestionSet);

      // Clone các items
      const newItems = sourceItems.map((item) =>
        itemRepo.create({
          questionSetId: savedSet.id,
          position: item.position,
          text: item.text,
          source: item.source,
          competency: item.competency,
          evaluationCriterionId: item.evaluationCriterionId,
          difficulty: item.difficulty,
          allowFollowUp: item.allowFollowUp,
          maxFollowUps: item.maxFollowUps,
          evidenceRefs: item.evidenceRefs,
          reviewNotes: item.reviewNotes,
        }),
      );

      const savedItems =
        newItems.length > 0 ? await itemRepo.save(newItems) : [];

      // Ghi Audit Log
      await this.auditService.record(
        {
          actorId: actor.userId,
          actorType: 'user',
          action: 'question-sets.clone',
          targetType: 'question_set',
          targetId: savedSet.id,
          ownerId: savedSet.ownerId,
          metadata: {
            sourceQuestionSetId: sourceSet.id,
            sourceVersion: sourceSet.version,
            sourceStatus: sourceSet.status,
            itemCount: savedItems.length,
          },
          requestId: actor.requestId,
        },
        manager,
      );

      return this.mapToDetailDto(savedSet, savedItems, false);
    });
  }

  /**
   * Soft-delete Question Set (Dành cho Admin)
   */
  async remove(actor: ActorContext, id: string): Promise<void> {
    const questionSet = await this.questionSetRepository.findOne({
      where: { id },
    });

    if (!questionSet || questionSet.deletedAt) {
      throw new NotFoundException({
        code: ErrorCodes.QUESTION_SET_NOT_FOUND,
        message: 'Question Set không tồn tại',
      });
    }

    questionSet.deletedAt = new Date();
    await this.questionSetRepository.save(questionSet);

    await this.auditService.record({
      actorId: actor.userId,
      actorType: 'user',
      action: 'question-sets.delete',
      targetType: 'question_set',
      targetId: questionSet.id,
      ownerId: questionSet.ownerId,
      metadata: {
        applicationId: questionSet.applicationId,
      },
      requestId: actor.requestId,
    });
  }

  /**
   * Kiểm tra xem Question Set có bị cũ (stale) so với Application / CV / Job không
   */
  private checkIfStale(
    questionSet: QuestionSet,
    application: Application,
    currentCvVersion: CvVersion | null,
    job: Job | null,
  ): boolean {
    // 1. Application CV version đã thay đổi
    if (
      application.currentCvVersionId &&
      application.currentCvVersionId !== questionSet.cvVersionId
    ) {
      return true;
    }

    // 2. CV profileVersion đã thay đổi
    if (
      currentCvVersion &&
      currentCvVersion.profileVersion !== questionSet.cvProfileVersion
    ) {
      return true;
    }

    // 3. Job version đã thay đổi
    if (job && job.version !== questionSet.jobVersion) {
      return true;
    }

    return false;
  }

  /**
   * Chuyển đổi sang Summary DTO
   */
  private mapToSummaryDto(
    set: QuestionSet,
    itemCount: number,
    isStale?: boolean,
  ): QuestionSetSummaryDto {
    return {
      id: set.id,
      ownerId: set.ownerId,
      applicationId: set.applicationId,
      cvVersionId: set.cvVersionId,
      cvProfileVersion: set.cvProfileVersion,
      jobVersion: set.jobVersion,
      language: set.language,
      mode: set.mode,
      status: set.status,
      version: set.version,
      generationVersion: set.generationVersion,
      aiRunId: set.aiRunId,
      sourceQuestionSetId: set.sourceQuestionSetId,
      approvedBy: set.approvedBy,
      approvedAt: set.approvedAt,
      itemCount,
      isStale,
      createdAt: set.createdAt,
      updatedAt: set.updatedAt,
    };
  }

  /**
   * Chuyển đổi sang Detail DTO
   */
  private mapToDetailDto(
    set: QuestionSet,
    items: QuestionSetItem[],
    isStale: boolean,
  ): QuestionSetDetailDto {
    const itemDtos: QuestionSetItemResponseDto[] = (items || []).map(
      (item) => ({
        id: item.id,
        position: item.position,
        text: item.text,
        source: item.source,
        competency: item.competency,
        evaluationCriterionId: item.evaluationCriterionId,
        difficulty: item.difficulty,
        allowFollowUp: item.allowFollowUp,
        maxFollowUps: item.maxFollowUps,
        evidenceRefs: item.evidenceRefs,
        reviewNotes: item.reviewNotes,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }),
    );

    return {
      id: set.id,
      ownerId: set.ownerId,
      applicationId: set.applicationId,
      cvVersionId: set.cvVersionId,
      cvProfileVersion: set.cvProfileVersion,
      jobVersion: set.jobVersion,
      profileSnapshot: set.profileSnapshot,
      jobSnapshot: set.jobSnapshot,
      language: set.language,
      mode: set.mode,
      status: set.status,
      version: set.version,
      generationVersion: set.generationVersion,
      aiRunId: set.aiRunId,
      sourceQuestionSetId: set.sourceQuestionSetId,
      approvedBy: set.approvedBy,
      approvedAt: set.approvedAt,
      itemCount: itemDtos.length,
      isStale,
      items: itemDtos,
      createdAt: set.createdAt,
      updatedAt: set.updatedAt,
    };
  }
}
