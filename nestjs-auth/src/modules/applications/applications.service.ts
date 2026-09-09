import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Application } from './entities/application.entity';
import { ApplicationStatus } from './enums/application-status.enum';
import { ApplicationListScope } from './enums/application-list-scope.enum';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { WithdrawApplicationDto } from './dto/withdraw-application.dto';
import { ListApplicationsQueryDto } from './dto/list-applications-query.dto';
import { ApplicationResponseDto } from './dto/application-response.dto';
import { Candidate } from '../candidates/entities/candidate.entity';
import { Job } from '../jobs/entities/job.entity';
import { JobStatus } from '../jobs/enums/job-status.enum';
import { PermissionsService } from '../admin/permissions/permissions.service';
import { Permissions } from '../admin/permissions/permissions.constants';
import { AuditService } from '../../platform/audit/audit.service';
import { IdempotencyService } from '../../platform/idempotency/idempotency.service';
import { ActorContext } from '../../common/context/actor-context';
import {
  createPaginationResult,
  PaginatedResult,
} from '../../common/dto/pagination.dto';
import { VersionConflictException } from '../../common/dto/expected-version.dto';
import { ErrorCodes } from '../../common/errors/error-codes';

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectRepository(Application)
    private readonly applicationRepository: Repository<Application>,
    private readonly dataSource: DataSource,
    private readonly permissionsService: PermissionsService,
    private readonly auditService: AuditService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  /**
   * Tạo Application mới với Idempotency
   */
  async create(
    actor: ActorContext,
    dto: CreateApplicationDto,
    idempotencyKey?: string,
  ): Promise<ApplicationResponseDto> {
    if (!idempotencyKey) {
      throw new BadRequestException(
        'Header Idempotency-Key là bắt buộc khi tạo hồ sơ ứng tuyển',
      );
    }

    const idempotencyResult =
      await this.idempotencyService.execute<ApplicationResponseDto>({
        actorScope: actor.userId,
        route: '/api/v1/applications',
        method: 'POST',
        key: idempotencyKey,
        body: dto,
        action: async () => {
          const body = await this.executeCreate(actor, dto);
          return { status: 201, body };
        },
      });

    return idempotencyResult.body;
  }

  private async executeCreate(
    actor: ActorContext,
    dto: CreateApplicationDto,
  ): Promise<ApplicationResponseDto> {
    const isApplicationAdmin = await this.permissionsService.hasAll(
      actor.userId,
      [Permissions.ApplicationsManage],
    );

    // 1. Kiểm tra Candidate tồn tại và quyền sở hữu
    const candidate = await this.dataSource.getRepository(Candidate).findOne({
      where: { id: dto.candidateId },
    });

    if (!candidate || candidate.deletedAt !== null) {
      throw new NotFoundException({
        code: ErrorCodes.CANDIDATE_NOT_FOUND,
        message: 'Không tìm thấy ứng viên hoặc ứng viên đã bị xóa',
      });
    }

    if (!isApplicationAdmin && candidate.ownerId !== actor.userId) {
      throw new ForbiddenException({
        code: ErrorCodes.MISSING_PERMISSION,
        message: 'Bạn chỉ có thể tạo hồ sơ cho ứng viên thuộc sở hữu của mình',
      });
    }

    // 2. Kiểm tra Job
    const job = await this.dataSource.getRepository(Job).findOne({
      where: { id: dto.jobId },
    });

    if (!job || job.deletedAt !== null) {
      throw new NotFoundException({
        code: ErrorCodes.JOB_NOT_FOUND,
        message: 'Không tìm thấy tin tuyển dụng hoặc tin đã bị xóa',
      });
    }

    if (job.status === JobStatus.CLOSED) {
      throw new ConflictException({
        code: ErrorCodes.JOB_NOT_ACCEPTING_APPLICATIONS,
        message:
          'Vị trí tuyển dụng đã đóng, không tiếp nhận thêm hồ sơ ứng tuyển',
      });
    }

    if (job.status === JobStatus.DRAFT) {
      const isJobAdmin = await this.permissionsService.hasAll(actor.userId, [
        Permissions.JobsManage,
      ]);
      if (!isJobAdmin && job.ownerId !== actor.userId) {
        throw new NotFoundException({
          code: ErrorCodes.JOB_NOT_FOUND,
          message: 'Không tìm thấy tin tuyển dụng',
        });
      }
    }

    // 3. Kiểm tra duplicate (ownerId, candidateId, jobId) trong các active applications
    const existing = await this.applicationRepository
      .createQueryBuilder('app')
      .where('app.ownerId = :ownerId', { ownerId: actor.userId })
      .andWhere('app.candidateId = :candidateId', {
        candidateId: dto.candidateId,
      })
      .andWhere('app.jobId = :jobId', { jobId: dto.jobId })
      .andWhere('app.deletedAt IS NULL')
      .getOne();

    if (existing) {
      throw new ConflictException({
        code: ErrorCodes.APPLICATION_ALREADY_EXISTS,
        message: 'Ứng viên này đã được bạn nộp hồ sơ vào vị trí tuyển dụng này',
        details: { applicationId: existing.id },
      });
    }

    return this.dataSource.transaction(async (manager) => {
      const appRepo = manager.getRepository(Application);

      const application = appRepo.create({
        ownerId: actor.userId,
        candidateId: dto.candidateId,
        jobId: dto.jobId,
        status: ApplicationStatus.SHORTLISTED,
        version: 1,
        notes: dto.notes?.trim() || null,
      });

      const saved = await appRepo.save(application);

      await this.auditService.record(
        {
          actorId: actor.userId,
          actorType: 'user',
          action: 'applications.create',
          targetType: 'application',
          targetId: saved.id,
          ownerId: saved.ownerId,
          requestId: actor.requestId,
          metadata: {
            ownerId: saved.ownerId,
            candidateId: saved.candidateId,
            jobId: saved.jobId,
            status: saved.status,
          },
        },
        manager,
      );

      return this.toResponseDto(saved, candidate, job);
    });
  }

  /**
   * Danh sách Application (phân trang offset-based, scope visibility)
   */
  async findAll(
    actor: ActorContext,
    query: ListApplicationsQueryDto,
  ): Promise<PaginatedResult<ApplicationResponseDto>> {
    const isAppAdmin = await this.permissionsService.hasAll(actor.userId, [
      Permissions.ApplicationsManage,
    ]);

    const qb = this.applicationRepository
      .createQueryBuilder('app')
      .leftJoinAndSelect('app.candidate', 'candidate')
      .leftJoinAndSelect('app.job', 'job')
      .leftJoinAndSelect('app.owner', 'owner')
      .leftJoinAndSelect('owner.roleAssignments', 'roleAssignments')
      .leftJoinAndSelect('roleAssignments.role', 'role')
      .where('app.deletedAt IS NULL');

    // Scoping
    if (!isAppAdmin) {
      const scope = query.scope ?? ApplicationListScope.ALL;
      if (scope === ApplicationListScope.MINE) {
        qb.andWhere('app.ownerId = :userId', { userId: actor.userId });
      } else if (scope === ApplicationListScope.JOB_OWNED) {
        qb.andWhere('job.ownerId = :userId', { userId: actor.userId });
      } else {
        // scope === 'all' for regular user
        qb.andWhere('(app.ownerId = :userId OR job.ownerId = :userId)', {
          userId: actor.userId,
        });
      }
    } else if (query.scope) {
      // Admin can explicitly filter by scope if desired
      if (query.scope === ApplicationListScope.MINE) {
        qb.andWhere('app.ownerId = :userId', { userId: actor.userId });
      } else if (query.scope === ApplicationListScope.JOB_OWNED) {
        qb.andWhere('job.ownerId = :userId', { userId: actor.userId });
      }
    }

    // Optional filters
    if (query.jobId) {
      qb.andWhere('app.jobId = :jobId', { jobId: query.jobId });
    }
    if (query.candidateId) {
      qb.andWhere('app.candidateId = :candidateId', {
        candidateId: query.candidateId,
      });
    }
    if (query.status) {
      qb.andWhere('app.status = :status', { status: query.status });
    }

    qb.orderBy('app.createdAt', 'DESC').addOrderBy('app.id', 'DESC');

    const totalItems = await qb.getCount();
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const applications = await qb.skip(skip).take(limit).getMany();

    return createPaginationResult(
      applications.map((app) =>
        this.toResponseDto(app, app.candidate, app.job),
      ),
      totalItems,
      query,
    );
  }

  /**
   * Chi tiết Application theo ID
   */
  async findOne(
    actor: ActorContext,
    id: string,
  ): Promise<ApplicationResponseDto> {
    const application = await this.applicationRepository
      .createQueryBuilder('app')
      .leftJoinAndSelect('app.candidate', 'candidate')
      .leftJoinAndSelect('app.job', 'job')
      .leftJoinAndSelect('app.owner', 'owner')
      .leftJoinAndSelect('owner.roleAssignments', 'roleAssignments')
      .leftJoinAndSelect('roleAssignments.role', 'role')
      .where('app.id = :id', { id })
      .andWhere('app.deletedAt IS NULL')
      .getOne();

    if (!application) {
      throw new NotFoundException({
        code: ErrorCodes.APPLICATION_NOT_FOUND,
        message: 'Không tìm thấy hồ sơ ứng tuyển hoặc hồ sơ đã bị xóa',
      });
    }

    const isAppAdmin = await this.permissionsService.hasAll(actor.userId, [
      Permissions.ApplicationsManage,
    ]);

    const isApplicationOwner = application.ownerId === actor.userId;
    const isJobOwner = application.job?.ownerId === actor.userId;

    if (!isAppAdmin && !isApplicationOwner && !isJobOwner) {
      throw new ForbiddenException({
        code: ErrorCodes.MISSING_PERMISSION,
        message: 'Bạn không có quyền truy cập hồ sơ ứng tuyển này',
      });
    }

    return this.toResponseDto(
      application,
      application.candidate,
      application.job,
    );
  }

  /**
   * Cập nhật ghi chú (notes) cho Application với Optimistic Concurrency Control
   */
  async update(
    actor: ActorContext,
    id: string,
    dto: UpdateApplicationDto,
  ): Promise<ApplicationResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const appRepo = manager.getRepository(Application);

      // Pessimistic lock row
      const application = await appRepo
        .createQueryBuilder('app')
        .setLock('pessimistic_write')
        .leftJoinAndSelect('app.candidate', 'candidate')
        .leftJoinAndSelect('app.job', 'job')
        .where('app.id = :id', { id })
        .andWhere('app.deletedAt IS NULL')
        .getOne();

      if (!application) {
        throw new NotFoundException({
          code: ErrorCodes.APPLICATION_NOT_FOUND,
          message: 'Không tìm thấy hồ sơ ứng tuyển để cập nhật',
        });
      }

      const isAppAdmin = await this.permissionsService.hasAll(actor.userId, [
        Permissions.ApplicationsManage,
      ]);

      const isApplicationOwner = application.ownerId === actor.userId;
      const isJobOwner = application.job?.ownerId === actor.userId;

      if (!isAppAdmin && !isApplicationOwner && !isJobOwner) {
        throw new ForbiddenException({
          code: ErrorCodes.MISSING_PERMISSION,
          message: 'Bạn không có quyền cập nhật hồ sơ ứng tuyển này',
        });
      }

      // Check version
      if (application.version !== dto.expectedVersion) {
        throw new VersionConflictException(
          `Phiên bản không khớp. Current version: ${application.version}, expected: ${dto.expectedVersion}`,
        );
      }

      if (dto.notes !== undefined) {
        application.notes = dto.notes.trim() || null;
      }

      application.version += 1;

      const updated = await appRepo.save(application);

      await this.auditService.record(
        {
          actorId: actor.userId,
          actorType: 'user',
          action: 'applications.update',
          targetType: 'application',
          targetId: updated.id,
          ownerId: updated.ownerId,
          requestId: actor.requestId,
          metadata: {
            notes: updated.notes,
            version: updated.version,
          },
        },
        manager,
      );

      return this.toResponseDto(updated, updated.candidate, updated.job);
    });
  }

  /**
   * Rút hồ sơ ứng tuyển (Withdraw)
   */
  async withdraw(
    actor: ActorContext,
    id: string,
    dto: WithdrawApplicationDto,
  ): Promise<ApplicationResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const appRepo = manager.getRepository(Application);

      const application = await appRepo
        .createQueryBuilder('app')
        .setLock('pessimistic_write')
        .leftJoinAndSelect('app.candidate', 'candidate')
        .leftJoinAndSelect('app.job', 'job')
        .where('app.id = :id', { id })
        .andWhere('app.deletedAt IS NULL')
        .getOne();

      if (!application) {
        throw new NotFoundException({
          code: ErrorCodes.APPLICATION_NOT_FOUND,
          message: 'Không tìm thấy hồ sơ ứng tuyển để rút',
        });
      }

      const isAppAdmin = await this.permissionsService.hasAll(actor.userId, [
        Permissions.ApplicationsManage,
      ]);

      // Application owner hoặc Admin mới có quyền rút hồ sơ
      if (!isAppAdmin && application.ownerId !== actor.userId) {
        throw new ForbiddenException({
          code: ErrorCodes.MISSING_PERMISSION,
          message: 'Bạn không có quyền rút hồ sơ ứng tuyển này',
        });
      }

      // Check version
      if (application.version !== dto.expectedVersion) {
        throw new VersionConflictException(
          `Phiên bản không khớp. Current version: ${application.version}, expected: ${dto.expectedVersion}`,
        );
      }

      // Idempotent withdraw: nếu đã withdrawn thì trả về luôn không lỗi
      if (application.status === ApplicationStatus.WITHDRAWN) {
        return this.toResponseDto(
          application,
          application.candidate,
          application.job,
        );
      }

      // Không cho phép rút nếu đã ở trạng thái kết thúc (approved / rejected)
      if (
        application.status === ApplicationStatus.APPROVED ||
        application.status === ApplicationStatus.REJECTED
      ) {
        throw new ConflictException({
          code: ErrorCodes.APPLICATION_STATE_CONFLICT,
          message: `Không thể rút hồ sơ đã ở trạng thái ${application.status}`,
        });
      }

      application.status = ApplicationStatus.WITHDRAWN;
      application.withdrawReason = dto.reason?.trim() || null;
      application.withdrawnAt = new Date();
      application.version += 1;

      const saved = await appRepo.save(application);

      await this.auditService.record(
        {
          actorId: actor.userId,
          actorType: 'user',
          action: 'applications.withdraw',
          targetType: 'application',
          targetId: saved.id,
          ownerId: saved.ownerId,
          requestId: actor.requestId,
          metadata: {
            status: saved.status,
            reason: saved.withdrawReason,
            version: saved.version,
          },
        },
        manager,
      );

      return this.toResponseDto(saved, saved.candidate, saved.job);
    });
  }

  /**
   * Xóa hồ sơ (Soft delete) - chỉ Admin applications:manage
   */
  async remove(actor: ActorContext, id: string): Promise<void> {
    const isAppAdmin = await this.permissionsService.hasAll(actor.userId, [
      Permissions.ApplicationsManage,
    ]);

    if (!isAppAdmin) {
      throw new ForbiddenException({
        code: ErrorCodes.MISSING_PERMISSION,
        message: 'Chỉ quản trị viên mới có quyền xóa hồ sơ ứng tuyển',
      });
    }

    const application = await this.applicationRepository.findOne({
      where: { id },
    });

    if (!application || application.deletedAt !== null) {
      throw new NotFoundException({
        code: ErrorCodes.APPLICATION_NOT_FOUND,
        message: 'Không tìm thấy hồ sơ ứng tuyển để xóa',
      });
    }

    return this.dataSource.transaction(async (manager) => {
      const appRepo = manager.getRepository(Application);
      await appRepo.softDelete(id);

      await this.auditService.record(
        {
          actorId: actor.userId,
          actorType: 'user',
          action: 'applications.delete',
          targetType: 'application',
          targetId: id,
          ownerId: application.ownerId,
          requestId: actor.requestId,
          metadata: {
            candidateId: application.candidateId,
            jobId: application.jobId,
          },
        },
        manager,
      );
    });
  }

  private toResponseDto(
    app: Application,
    candidate?: Candidate | null,
    job?: Job | null,
  ): ApplicationResponseDto {
    const userRole =
      app.owner?.roleAssignments?.[0]?.role?.name ||
      app.owner?.roleAssignments?.[0]?.role?.key ||
      'user';
    return {
      id: app.id,
      candidateId: app.candidateId,
      jobId: app.jobId,
      currentCvVersionId: app.currentCvVersionId,
      status: app.status,
      version: app.version,
      notes: app.notes,
      withdrawReason: app.withdrawReason,
      withdrawnAt: app.withdrawnAt,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
      owner: app.owner
        ? {
            ownerId: app.owner.id,
            name: app.owner.name,
            role: [userRole.toUpperCase()],
          }
        : undefined,
      candidate: candidate
        ? {
            id: candidate.id,
            fullName: candidate.fullName,
            email: candidate.email,
            phone: candidate.phone,
          }
        : undefined,
      job: job
        ? {
            id: job.id,
            title: job.title,
            status: job.status,
            ownerId: job.ownerId,
          }
        : undefined,
    };
  }
}
