import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Candidate } from './entities/candidate.entity';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { ListCandidatesQueryDto } from './dto/list-candidates-query.dto';
import { CandidateResponseDto } from './dto/candidate-response.dto';
import { Application } from '../applications/entities/application.entity';
import { PermissionsService } from '../admin/permissions/permissions.service';
import { Permissions } from '../admin/permissions/permissions.constants';
import { AuditService } from '../../platform/audit/audit.service';
import { ActorContext } from '../../common/context/actor-context';
import {
  createPaginationResult,
  PaginatedResult,
} from '../../common/dto/pagination.dto';
import { ErrorCodes } from '../../common/errors/error-codes';

@Injectable()
export class CandidatesService {
  constructor(
    @InjectRepository(Candidate)
    private readonly candidateRepository: Repository<Candidate>,
    private readonly dataSource: DataSource,
    private readonly permissionsService: PermissionsService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Tạo Candidate mới
   */
  async create(
    actor: ActorContext,
    dto: CreateCandidateDto,
  ): Promise<CandidateResponseDto> {
    const fullName = dto.fullName.trim();
    const email = dto.email.trim();
    const normalizedEmail = email.toLowerCase();
    const phone = dto.phone?.trim() || null;
    const notes = dto.notes?.trim() || null;

    // Check duplicate (ownerId, normalizedEmail) among non-deleted
    const existing = await this.candidateRepository
      .createQueryBuilder('candidate')
      .where('candidate.ownerId = :ownerId', { ownerId: actor.userId })
      .andWhere('candidate.normalizedEmail = :normalizedEmail', {
        normalizedEmail,
      })
      .andWhere('candidate.deletedAt IS NULL')
      .getOne();

    if (existing) {
      throw new ConflictException({
        code: ErrorCodes.CANDIDATE_ALREADY_EXISTS,
        message: 'Ứng viên với email này đã tồn tại trong danh sách của bạn',
        details: { candidateId: existing.id },
      });
    }

    return this.dataSource.transaction(async (manager) => {
      const candidateRepo = manager.getRepository(Candidate);

      const candidate = candidateRepo.create({
        ownerId: actor.userId,
        fullName,
        email,
        normalizedEmail,
        phone,
        notes,
      });

      const saved = await candidateRepo.save(candidate);

      await this.auditService.record(
        {
          actorId: actor.userId,
          actorType: 'user',
          action: 'candidates.create',
          targetType: 'candidate',
          targetId: saved.id,
          ownerId: saved.ownerId,
          requestId: actor.requestId,
          metadata: {
            fullName: saved.fullName,
            email: saved.email,
            ownerId: saved.ownerId,
          },
        },
        manager,
      );

      return this.toResponseDto(saved);
    });
  }

  /**
   * Danh sách Candidate (phân trang offset-based)
   */
  async findAll(
    actor: ActorContext,
    query: ListCandidatesQueryDto,
  ): Promise<PaginatedResult<CandidateResponseDto>> {
    const isAdmin = await this.permissionsService.hasAll(actor.userId, [
      Permissions.CandidatesManage,
    ]);

    const qb = this.candidateRepository
      .createQueryBuilder('candidate')
      .leftJoinAndSelect('candidate.owner', 'owner')
      .leftJoinAndSelect('owner.roleAssignments', 'roleAssignment')
      .leftJoinAndSelect('roleAssignment.role', 'role');
    qb.where('candidate.deletedAt IS NULL');

    if (!isAdmin) {
      qb.andWhere('candidate.ownerId = :ownerId', { ownerId: actor.userId });
    }

    if (query.search) {
      const search = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(candidate.fullName) LIKE :search OR LOWER(candidate.email) LIKE :search)',
        { search },
      );
    }

    qb.orderBy('candidate.createdAt', 'DESC').addOrderBy(
      'candidate.id',
      'DESC',
    );

    const totalItems = await qb.getCount();
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const candidates = await qb.skip(skip).take(limit).getMany();

    return createPaginationResult(
      candidates.map((c) => this.toResponseDto(c)),
      totalItems,
      query,
    );
  }

  /**
   * Chi tiết Candidate theo ID
   */
  async findOne(
    actor: ActorContext,
    id: string,
  ): Promise<CandidateResponseDto> {
    const candidate = await this.candidateRepository.findOne({
      where: { id },
    });

    if (!candidate || candidate.deletedAt !== null) {
      throw new NotFoundException({
        code: ErrorCodes.CANDIDATE_NOT_FOUND,
        message: 'Không tìm thấy ứng viên hoặc ứng viên đã bị xóa',
      });
    }

    const isAdmin = await this.permissionsService.hasAll(actor.userId, [
      Permissions.CandidatesManage,
    ]);

    if (!isAdmin && candidate.ownerId !== actor.userId) {
      throw new ForbiddenException({
        code: ErrorCodes.MISSING_PERMISSION,
        message: 'Bạn không có quyền truy cập ứng viên này',
      });
    }

    return this.toResponseDto(candidate);
  }

  /**
   * Cập nhật Candidate
   */
  async update(
    actor: ActorContext,
    id: string,
    dto: UpdateCandidateDto,
  ): Promise<CandidateResponseDto> {
    const candidate = await this.candidateRepository.findOne({
      where: { id },
    });

    if (!candidate || candidate.deletedAt !== null) {
      throw new NotFoundException({
        code: ErrorCodes.CANDIDATE_NOT_FOUND,
        message: 'Không tìm thấy ứng viên để cập nhật',
      });
    }

    const isAdmin = await this.permissionsService.hasAll(actor.userId, [
      Permissions.CandidatesManage,
    ]);

    if (!isAdmin && candidate.ownerId !== actor.userId) {
      throw new ForbiddenException({
        code: ErrorCodes.MISSING_PERMISSION,
        message: 'Bạn không có quyền cập nhật ứng viên này',
      });
    }

    const normalizedEmail = dto.email
      ? dto.email.trim().toLowerCase()
      : undefined;

    // Check duplicate email for same owner if email is modified
    if (normalizedEmail && normalizedEmail !== candidate.normalizedEmail) {
      const duplicate = await this.candidateRepository
        .createQueryBuilder('c')
        .where('c.ownerId = :ownerId', { ownerId: candidate.ownerId })
        .andWhere('c.normalizedEmail = :normalizedEmail', { normalizedEmail })
        .andWhere('c.id != :id', { id })
        .andWhere('c.deletedAt IS NULL')
        .getOne();

      if (duplicate) {
        throw new ConflictException({
          code: ErrorCodes.CANDIDATE_ALREADY_EXISTS,
          message:
            'Ứng viên với email này đã tồn tại trong danh sách của chủ sở hữu',
          details: { candidateId: duplicate.id },
        });
      }
    }

    return this.dataSource.transaction(async (manager) => {
      const candidateRepo = manager.getRepository(Candidate);

      if (dto.fullName !== undefined) {
        candidate.fullName = dto.fullName.trim();
      }
      if (dto.email !== undefined) {
        candidate.email = dto.email.trim();
        candidate.normalizedEmail = dto.email.trim().toLowerCase();
      }
      if (dto.phone !== undefined) {
        candidate.phone = dto.phone.trim() || null;
      }
      if (dto.notes !== undefined) {
        candidate.notes = dto.notes.trim() || null;
      }

      const updated = await candidateRepo.save(candidate);

      await this.auditService.record(
        {
          actorId: actor.userId,
          actorType: 'user',
          action: 'candidates.update',
          targetType: 'candidate',
          targetId: updated.id,
          ownerId: updated.ownerId,
          requestId: actor.requestId,
          metadata: {
            changes: dto,
            ownerId: updated.ownerId,
          },
        },
        manager,
      );

      return this.toResponseDto(updated);
    });
  }

  /**
   * Xóa Candidate (Soft delete) - chỉ admin có candidates:manage
   */
  async remove(actor: ActorContext, id: string): Promise<void> {
    const isAdmin = await this.permissionsService.hasAll(actor.userId, [
      Permissions.CandidatesManage,
    ]);

    if (!isAdmin) {
      throw new ForbiddenException({
        code: ErrorCodes.MISSING_PERMISSION,
        message: 'Chỉ quản trị viên mới có quyền xóa ứng viên',
      });
    }

    const candidate = await this.candidateRepository.findOne({
      where: { id },
    });

    if (!candidate || candidate.deletedAt !== null) {
      throw new NotFoundException({
        code: ErrorCodes.CANDIDATE_NOT_FOUND,
        message: 'Không tìm thấy ứng viên để xóa',
      });
    }

    return this.dataSource.transaction(async (manager) => {
      const applicationRepo = manager.getRepository(Application);

      // Check if candidate has active applications
      const activeApplicationCount = await applicationRepo
        .createQueryBuilder('app')
        .where('app.candidateId = :candidateId', { candidateId: id })
        .andWhere('app.deletedAt IS NULL')
        .getCount();

      if (activeApplicationCount > 0) {
        throw new ConflictException({
          code: ErrorCodes.CANDIDATE_HAS_APPLICATIONS,
          message: 'Không thể xóa ứng viên đang có hồ sơ ứng tuyển hoạt động',
          details: { activeApplications: activeApplicationCount },
        });
      }

      const candidateRepo = manager.getRepository(Candidate);
      await candidateRepo.softDelete(id);

      await this.auditService.record(
        {
          actorId: actor.userId,
          actorType: 'user',
          action: 'candidates.delete',
          targetType: 'candidate',
          targetId: id,
          ownerId: candidate.ownerId,
          requestId: actor.requestId,
          metadata: {
            fullName: candidate.fullName,
            email: candidate.email,
          },
        },
        manager,
      );
    });
  }

  private toResponseDto(candidate: Candidate): CandidateResponseDto {
    const userRole =
      candidate.owner?.roleAssignments?.[0]?.role?.name ||
      candidate.owner?.roleAssignments?.[0]?.role?.key ||
      'user';

    return {
      id: candidate.id,
      owner: candidate.owner
        ? {
            ownerId: candidate.owner.id,
            name: candidate.owner.name,
            role: [userRole.toUpperCase()],
          }
        : undefined,
      fullName: candidate.fullName,
      email: candidate.email,
      normalizedEmail: candidate.normalizedEmail,
      phone: candidate.phone,
      notes: candidate.notes,
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
    };
  }
}
