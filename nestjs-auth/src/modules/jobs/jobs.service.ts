import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { Job } from './entities/job.entity';
import { JobStatus } from './enums/job-status.enum';
import { JobListScope } from './enums/job-list-scope.enum';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { CloseJobDto } from './dto/close-job.dto';
import { ListJobsQueryDto } from './dto/list-jobs-query.dto';
import { JobResponseDto } from './dto/job-response.dto';
import { normalizeRequiredSkills } from './dto/skills.validator';
import { normalizeEvaluationCriteria } from './dto/evaluation-criterion.dto';
import { PermissionsService } from '../admin/permissions/permissions.service';
import { Permissions } from '../admin/permissions/permissions.constants';
import { AuditService } from '../../platform/audit/audit.service';
import { ActorContext } from '../../common/context/actor-context';
import {
  createPaginationResult,
  PaginatedResult,
} from '../../common/dto/pagination.dto';
import { VersionConflictException } from '../../common/dto/expected-version.dto';

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
    private readonly dataSource: DataSource,
    private readonly permissionsService: PermissionsService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Tạo Job mới
   */
  async create(
    actor: ActorContext,
    dto: CreateJobDto,
  ): Promise<JobResponseDto> {
    if (dto.status === (JobStatus.CLOSED as unknown)) {
      throw new BadRequestException(
        'Không thể tạo trực tiếp Job ở trạng thái closed',
      );
    }

    const title = dto.title.trim();
    const description = dto.description.trim();
    const requiredSkills = normalizeRequiredSkills(dto.requiredSkills);
    const evaluationCriteria = normalizeEvaluationCriteria(
      dto.evaluationCriteria,
    );
    const status = dto.status ?? JobStatus.DRAFT;

    return this.dataSource.transaction(async (manager) => {
      const jobRepo = manager.getRepository(Job);
      const job = jobRepo.create({
        ownerId: actor.userId,
        title,
        description,
        requiredSkills,
        evaluationCriteria,
        status,
        version: 1,
      });

      const savedJob = await jobRepo.save(job);

      await this.auditService.record(
        {
          actorId: actor.userId,
          actorType: 'user',
          action: 'job.created',
          targetType: 'job',
          targetId: savedJob.id,
          ownerId: savedJob.ownerId,
          requestId: actor.requestId,
          metadata: {
            title: savedJob.title,
            status: savedJob.status,
            version: savedJob.version,
          },
        },
        manager,
      );

      return JobResponseDto.fromEntity(savedJob);
    });
  }

  /**
   * Lấy danh sách Job có phân trang và filter theo scope/status
   */
  async findAll(
    actor: ActorContext,
    query: ListJobsQueryDto,
  ): Promise<PaginatedResult<JobResponseDto>> {
    const canManage = await this.permissionsService.hasAll(actor.userId, [
      Permissions.JobsManage,
    ]);

    const qb = this.jobRepository.createQueryBuilder('job');
    qb.where('job.deletedAt IS NULL');

    const scope = query.scope ?? JobListScope.ALL;

    switch (scope) {
      case JobListScope.MINE:
        qb.andWhere('job.ownerId = :userId', { userId: actor.userId });
        break;

      case JobListScope.SHARED:
        qb.andWhere('job.ownerId != :userId AND job.status = :openStatus', {
          userId: actor.userId,
          openStatus: JobStatus.OPEN,
        });
        break;

      case JobListScope.ALL:
      default:
        if (!canManage) {
          qb.andWhere('(job.ownerId = :userId OR job.status = :openStatus)', {
            userId: actor.userId,
            openStatus: JobStatus.OPEN,
          });
        }
        break;
    }

    if (query.status) {
      qb.andWhere('job.status = :status', { status: query.status });
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip =
      typeof query.skip === 'number' ? query.skip : (page - 1) * limit;

    qb.orderBy('job.createdAt', 'DESC').addOrderBy('job.id', 'DESC');
    qb.skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();

    return createPaginationResult(
      items.map((j) => JobResponseDto.fromEntity(j)),
      total,
      query,
    );
  }

  /**
   * Lấy chi tiết một Job
   */
  async findOne(actor: ActorContext, id: string): Promise<JobResponseDto> {
    const canManage = await this.permissionsService.hasAll(actor.userId, [
      Permissions.JobsManage,
    ]);

    const job = await this.jobRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!job) {
      throw new NotFoundException({
        code: 'JOB_NOT_FOUND',
        message: 'Không tìm thấy vị trí tuyển dụng',
      });
    }

    const isOwner = job.ownerId === actor.userId;
    const isOpen = job.status === JobStatus.OPEN;

    if (!canManage && !isOwner && !isOpen) {
      throw new NotFoundException({
        code: 'JOB_NOT_FOUND',
        message: 'Không tìm thấy vị trí tuyển dụng',
      });
    }

    return JobResponseDto.fromEntity(job);
  }

  /**
   * Cập nhật Job với kiểm tra expectedVersion và pessimistic locking
   */
  async update(
    actor: ActorContext,
    id: string,
    dto: UpdateJobDto,
  ): Promise<JobResponseDto> {
    const canManage = await this.permissionsService.hasAll(actor.userId, [
      Permissions.JobsManage,
    ]);

    return this.dataSource.transaction(async (manager) => {
      const jobRepo = manager.getRepository(Job);
      const job = await jobRepo.findOne({
        where: { id, deletedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });

      if (!job) {
        throw new NotFoundException({
          code: 'JOB_NOT_FOUND',
          message: 'Không tìm thấy vị trí tuyển dụng',
        });
      }

      if (!canManage && job.ownerId !== actor.userId) {
        throw new NotFoundException({
          code: 'JOB_NOT_FOUND',
          message: 'Không tìm thấy vị trí tuyển dụng',
        });
      }

      if (job.version !== dto.expectedVersion) {
        throw new VersionConflictException(
          `Phiên bản dữ liệu không khớp (hiện tại: ${job.version}, gửi lên: ${dto.expectedVersion})`,
        );
      }

      if (job.status === JobStatus.CLOSED) {
        throw new BadRequestException(
          'Vị trí tuyển dụng đã đóng, không thể cập nhật',
        );
      }

      if (dto.status === (JobStatus.CLOSED as unknown)) {
        throw new BadRequestException(
          'Không thể đóng Job qua PATCH, vui lòng dùng endpoint /close',
        );
      }

      if (job.status === JobStatus.OPEN && dto.status === JobStatus.DRAFT) {
        throw new BadRequestException(
          'Không thể chuyển vị trí tuyển dụng từ open về draft',
        );
      }

      const changedFields: string[] = [];
      const previousStatus = job.status;
      const previousVersion = job.version;

      if (dto.title !== undefined && dto.title.trim() !== job.title) {
        job.title = dto.title.trim();
        changedFields.push('title');
      }

      if (
        dto.description !== undefined &&
        dto.description.trim() !== job.description
      ) {
        job.description = dto.description.trim();
        changedFields.push('description');
      }

      if (dto.requiredSkills !== undefined) {
        job.requiredSkills = normalizeRequiredSkills(dto.requiredSkills);
        changedFields.push('requiredSkills');
      }

      if (dto.evaluationCriteria !== undefined) {
        job.evaluationCriteria = normalizeEvaluationCriteria(
          dto.evaluationCriteria,
        );
        changedFields.push('evaluationCriteria');
      }

      const isOpening =
        previousStatus === JobStatus.DRAFT && dto.status === JobStatus.OPEN;
      if (dto.status !== undefined && dto.status !== job.status) {
        job.status = dto.status;
        changedFields.push('status');
      }

      job.version = previousVersion + 1;
      const updatedJob = await jobRepo.save(job);

      await this.auditService.record(
        {
          actorId: actor.userId,
          actorType: 'user',
          action: isOpening ? 'job.opened' : 'job.updated',
          targetType: 'job',
          targetId: updatedJob.id,
          ownerId: updatedJob.ownerId,
          requestId: actor.requestId,
          metadata: {
            changedFields,
            previousStatus,
            newStatus: updatedJob.status,
            previousVersion,
            newVersion: updatedJob.version,
            ownerId: updatedJob.ownerId,
          },
        },
        manager,
      );

      return JobResponseDto.fromEntity(updatedJob);
    });
  }
  
  /**
   * Đóng Job
   */
  async close(
    actor: ActorContext,
    id: string,
    dto: CloseJobDto,
  ): Promise<JobResponseDto> {
    const canManage = await this.permissionsService.hasAll(actor.userId, [
      Permissions.JobsManage,
    ]);

    return this.dataSource.transaction(async (manager) => {
      const jobRepo = manager.getRepository(Job);
      const job = await jobRepo.findOne({
        where: { id, deletedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });

      if (!job) {
        throw new NotFoundException({
          code: 'JOB_NOT_FOUND',
          message: 'Không tìm thấy vị trí tuyển dụng',
        });
      }

      if (!canManage && job.ownerId !== actor.userId) {
        throw new NotFoundException({
          code: 'JOB_NOT_FOUND',
          message: 'Không tìm thấy vị trí tuyển dụng',
        });
      }

      if (job.version !== dto.expectedVersion) {
        throw new VersionConflictException(
          `Phiên bản dữ liệu không khớp (hiện tại: ${job.version}, gửi lên: ${dto.expectedVersion})`,
        );
      }

      if (job.status === JobStatus.CLOSED) {
        throw new BadRequestException(
          'Vị trí tuyển dụng này đã ở trạng thái đóng',
        );
      }

      const previousStatus = job.status;
      const previousVersion = job.version;

      job.status = JobStatus.CLOSED;
      job.version = previousVersion + 1;

      const updatedJob = await jobRepo.save(job);

      await this.auditService.record(
        {
          actorId: actor.userId,
          actorType: 'user',
          action: 'job.closed',
          targetType: 'job',
          targetId: updatedJob.id,
          ownerId: updatedJob.ownerId,
          requestId: actor.requestId,
          metadata: {
            previousStatus,
            newStatus: JobStatus.CLOSED,
            previousVersion,
            newVersion: updatedJob.version,
            ownerId: updatedJob.ownerId,
          },
        },
        manager,
      );

      return JobResponseDto.fromEntity(updatedJob);
    });
  }

  /**
   * Soft delete Job (chỉ dành cho Admin có permission jobs:manage)
   */
  async softDelete(
    actor: ActorContext,
    id: string,
  ): Promise<{ message: string }> {
    return this.dataSource.transaction(async (manager) => {
      const jobRepo = manager.getRepository(Job);
      const job = await jobRepo.findOne({
        where: { id, deletedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });

      if (!job) {
        throw new NotFoundException({
          code: 'JOB_NOT_FOUND',
          message: 'Không tìm thấy vị trí tuyển dụng',
        });
      }

      job.deletedAt = new Date();
      await jobRepo.save(job);

      await this.auditService.record(
        {
          actorId: actor.userId,
          actorType: 'user',
          action: 'job.deleted',
          targetType: 'job',
          targetId: job.id,
          ownerId: job.ownerId,
          requestId: actor.requestId,
          metadata: {
            status: job.status,
            version: job.version,
            ownerId: job.ownerId,
          },
        },
        manager,
      );

      return { message: 'Đã xóa vị trí tuyển dụng thành công' };
    });
  }
}
