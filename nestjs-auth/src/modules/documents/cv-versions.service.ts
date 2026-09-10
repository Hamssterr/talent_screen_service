import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import { Readable } from 'stream';
import { CvVersion } from './entities/cv-version.entity';
import { Application } from '../applications/entities/application.entity';
import { ApplicationStatus } from '../applications/enums/application-status.enum';
import { StorageProvider } from './enums/storage-provider.enum';
import { CvExtractionStatus } from './enums/cv-extraction-status.enum';
import { CvProfileStatus } from './enums/cv-profile-status.enum';
import {
  CvVersionDetailDto,
  CvVersionSafeDto,
} from './dto/cv-version-response.dto';
import { ListCvVersionsQueryDto } from './dto/list-cv-versions-query.dto';
import { UpdateCvProfileDto } from './dto/update-cv-profile.dto';
import { ApproveCvProfileDto } from './dto/approve-cv-profile.dto';
import {
  DOCUMENT_STORAGE_TOKEN,
  type DocumentStorage,
} from '../../platform/storage/document-storage.interface';
import { AuditService } from '../../platform/audit/audit.service';
import { IdempotencyService } from '../../platform/idempotency/idempotency.service';
import { PermissionsService } from '../admin/permissions/permissions.service';
import { Permissions } from '../admin/permissions/permissions.constants';
import { ActorContext } from '../../common/context/actor-context';
import {
  createPaginationResult,
  PaginatedResult,
} from '../../common/dto/pagination.dto';
import { VersionConflictException } from '../../common/dto/expected-version.dto';
import { ErrorCodes } from '../../common/errors/error-codes';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CvVersionsService {
  private readonly logger = new Logger(CvVersionsService.name);

  constructor(
    @InjectRepository(CvVersion)
    private readonly cvVersionRepository: Repository<CvVersion>,
    @Inject(DOCUMENT_STORAGE_TOKEN)
    private readonly documentStorage: DocumentStorage,
    private readonly dataSource: DataSource,
    private readonly permissionsService: PermissionsService,
    private readonly auditService: AuditService,
    private readonly idempotencyService: IdempotencyService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Upload CV mới vào Application
   */
  async upload(
    actor: ActorContext,
    applicationId: string,
    file: Express.Multer.File | undefined,
    idempotencyKey?: string,
  ): Promise<CvVersionSafeDto> {
    if (!idempotencyKey || !idempotencyKey.trim()) {
      throw new BadRequestException(
        'Header Idempotency-Key là bắt buộc khi upload CV',
      );
    }

    // 1. Validate file presence
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException({
        code: ErrorCodes.CV_FILE_REQUIRED,
        message: 'File PDF bắt buộc phải được đính kèm trong trường "file"',
      });
    }

    // 2. Validate max size
    const maxSizeBytes =
      this.configService.get<number>('storage.maxFileSizeBytes') || 10485760;
    if (file.size > maxSizeBytes || file.buffer.length > maxSizeBytes) {
      throw new BadRequestException({
        code: ErrorCodes.CV_FILE_TOO_LARGE,
        message: `Kích thước file vượt quá giới hạn cho phép (${maxSizeBytes} bytes)`,
      });
    }

    // 3. Validate extension & MIME
    const originalFilename = file.originalname || 'document.pdf';
    const ext = originalFilename.split('.').pop()?.toLowerCase();
    if (ext !== 'pdf' || file.mimetype !== 'application/pdf') {
      throw new BadRequestException({
        code: ErrorCodes.CV_FILE_INVALID,
        message: 'Chỉ chấp nhận file định dạng PDF hợp lệ',
      });
    }

    // 4. Validate magic bytes (%PDF-)
    const header = file.buffer.subarray(0, 5).toString('ascii');
    if (header !== '%PDF-') {
      throw new BadRequestException({
        code: ErrorCodes.CV_FILE_INVALID,
        message: 'Nội dung file không phải là tài liệu PDF hợp lệ (sai header)',
      });
    }

    // 5. Sanitize original filename
    const sanitizedFilename = originalFilename
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 255);

    // 6. Compute SHA-256
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');

    // 7. Check application & permissions
    const isCvAdmin = await this.permissionsService.hasAll(actor.userId, [
      Permissions.CvManage,
    ]);

    const application = await this.dataSource
      .getRepository(Application)
      .createQueryBuilder('app')
      .where('app.id = :id', { id: applicationId })
      .andWhere('app.deletedAt IS NULL')
      .getOne();

    if (!application) {
      throw new NotFoundException({
        code: ErrorCodes.APPLICATION_NOT_FOUND,
        message: 'Không tìm thấy hồ sơ ứng tuyển',
      });
    }

    if (!isCvAdmin && application.ownerId !== actor.userId) {
      throw new ForbiddenException({
        code: ErrorCodes.MISSING_PERMISSION,
        message: 'Bạn không có quyền upload CV cho hồ sơ này',
      });
    }

    if (application.status !== ApplicationStatus.SHORTLISTED) {
      throw new ConflictException({
        code: ErrorCodes.APPLICATION_STATE_CONFLICT,
        message: `Chỉ được phép upload hoặc thay đổi CV khi hồ sơ ở trạng thái shortlisted (hiện tại: ${application.status})`,
      });
    }

    // 8. Idempotency Execution
    const canonicalPayload = {
      applicationId,
      sha256,
      sanitizedFilename,
      sizeBytes: file.size,
    };

    const idempotencyResult =
      await this.idempotencyService.execute<CvVersionSafeDto>({
        actorScope: actor.userId,
        route: `/api/v1/applications/${applicationId}/cv-versions`,
        method: 'POST',
        key: idempotencyKey,
        body: canonicalPayload,
        action: async () => {
          const body = await this.executeUpload(
            actor,
            application,
            file,
            sanitizedFilename,
            sha256,
          );
          return { status: 201, body };
        },
      });

    return idempotencyResult.body;
  }

  private async executeUpload(
    actor: ActorContext,
    application: Application,
    file: Express.Multer.File,
    sanitizedFilename: string,
    sha256: string,
  ): Promise<CvVersionSafeDto> {
    const driver = (this.configService.get<string>('storage.driver') ||
      'local') as StorageProvider;

    const folder =
      driver === StorageProvider.CLOUDINARY
        ? this.configService.get<string>('storage.cloudinary.folder') ||
          'talent-screen/cv'
        : 'cv';

    const storageKey = `${folder}/${application.id}/${randomUUID()}.pdf`;

    // 1. Upload to storage adapter first (no DB lock held)
    let storedDoc: import('../../platform/storage').StoredDocument;
    try {
      storedDoc = await this.documentStorage.put(storageKey, file.buffer, {
        mimeType: 'application/pdf',
      });
    } catch (err: unknown) {
      this.logger.error(
        `Failed to store document with key ${storageKey}: ${String(err)}`,
      );
      throw new BadRequestException({
        code: ErrorCodes.CV_STORAGE_ERROR,
        message: 'Không thể lưu trữ file vào hệ thống lưu trữ',
      });
    }

    // 2. Open DB Transaction, Lock Application, Insert CvVersion, Update Application
    try {
      return await this.dataSource.transaction(async (manager) => {
        const appRepo = manager.getRepository(Application);
        const cvRepo = manager.getRepository(CvVersion);

        // Lock Application FOR UPDATE
        const lockedApp = await appRepo
          .createQueryBuilder('app')
          .setLock('pessimistic_write')
          .where('app.id = :id', { id: application.id })
          .andWhere('app.deletedAt IS NULL')
          .getOne();

        if (!lockedApp) {
          throw new NotFoundException({
            code: ErrorCodes.APPLICATION_NOT_FOUND,
            message: 'Không tìm thấy hồ sơ ứng tuyển',
          });
        }

        if (lockedApp.status !== ApplicationStatus.SHORTLISTED) {
          throw new ConflictException({
            code: ErrorCodes.APPLICATION_STATE_CONFLICT,
            message: `Hồ sơ đã thay đổi trạng thái sang ${lockedApp.status}`,
          });
        }

        // Calculate next version
        const maxVersionRecord = await cvRepo
          .createQueryBuilder('cv')
          .select('MAX(cv.version)', 'max')
          .where('cv.applicationId = :applicationId', {
            applicationId: application.id,
          })
          .getRawOne<{ max: number | null }>();

        const nextVersion = (maxVersionRecord?.max ?? 0) + 1;

        // Insert CvVersion
        const cvVersion = cvRepo.create({
          ownerId: application.ownerId,
          applicationId: application.id,
          version: nextVersion,
          originalFilename: sanitizedFilename,
          storageProvider: driver,
          storageKey,
          storageMetadata: storedDoc.metadata || null,
          mimeType: 'application/pdf',
          sizeBytes: String(file.size),
          sha256,
          pageCount: null,
          extractionStatus: CvExtractionStatus.PENDING,
          processingVersion: 1,
          extractedText: null,
          profileJson: null,
          profileStatus: CvProfileStatus.DRAFT,
          profileVersion: 1,
          profileApprovedBy: null,
          profileApprovedAt: null,
          errorCode: null,
        });

        const savedCv = await cvRepo.save(cvVersion);

        // Update Application current pointer & increment version
        lockedApp.currentCvVersionId = savedCv.id;
        lockedApp.version += 1;
        await appRepo.save(lockedApp);

        // Audit log
        await this.auditService.record(
          {
            actorId: actor.userId,
            actorType: 'user',
            action: 'cv.uploaded',
            targetType: 'cv_version',
            targetId: savedCv.id,
            ownerId: savedCv.ownerId,
            requestId: actor.requestId,
            metadata: {
              applicationId: savedCv.applicationId,
              version: savedCv.version,
              sizeBytes: savedCv.sizeBytes,
              sha256: savedCv.sha256,
            },
          },
          manager,
        );

        return this.toSafeDto(savedCv);
      });
    } catch (dbError) {
      // Cleanup orphan file in storage
      this.logger.warn(
        `DB transaction failed during CV upload, cleaning up storage key: ${storageKey}`,
      );
      try {
        await this.documentStorage.delete(storageKey);
      } catch (cleanupErr) {
        this.logger.error(
          `Failed to cleanup orphan file at key ${storageKey}: ${String(cleanupErr)}`,
        );
      }
      throw dbError;
    }
  }

  /**
   * Danh sách các phiên bản CV của một Application (offset pagination)
   */
  async findAll(
    actor: ActorContext,
    applicationId: string,
    query: ListCvVersionsQueryDto,
  ): Promise<PaginatedResult<CvVersionSafeDto>> {
    const isCvAdmin = await this.permissionsService.hasAll(actor.userId, [
      Permissions.CvManage,
    ]);

    const application = await this.dataSource
      .getRepository(Application)
      .createQueryBuilder('app')
      .leftJoinAndSelect('app.job', 'job')
      .where('app.id = :id', { id: applicationId })
      .andWhere('app.deletedAt IS NULL')
      .getOne();

    if (!application) {
      throw new NotFoundException({
        code: ErrorCodes.APPLICATION_NOT_FOUND,
        message: 'Không tìm thấy hồ sơ ứng tuyển',
      });
    }

    const isApplicationOwner = application.ownerId === actor.userId;
    const isJobOwner = application.job?.ownerId === actor.userId;

    if (!isCvAdmin && !isApplicationOwner && !isJobOwner) {
      throw new NotFoundException({
        code: ErrorCodes.APPLICATION_NOT_FOUND,
        message: 'Không tìm thấy hồ sơ ứng tuyển',
      });
    }

    const qb = this.cvVersionRepository
      .createQueryBuilder('cv')
      .where('cv.applicationId = :applicationId', { applicationId })
      .andWhere('cv.deletedAt IS NULL')
      .orderBy('cv.version', 'DESC')
      .addOrderBy('cv.id', 'DESC');

    const totalItems = await qb.getCount();
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const list = await qb.skip(skip).take(limit).getMany();

    return createPaginationResult(
      list.map((item) => this.toSafeDto(item)),
      totalItems,
      query,
    );
  }

  /**
   * Chi tiết CV version theo ID
   */
  async findOne(actor: ActorContext, id: string): Promise<CvVersionDetailDto> {
    const isCvAdmin = await this.permissionsService.hasAll(actor.userId, [
      Permissions.CvManage,
    ]);

    const cv = await this.cvVersionRepository
      .createQueryBuilder('cv')
      .leftJoinAndSelect('cv.application', 'app')
      .leftJoinAndSelect('app.job', 'job')
      .where('cv.id = :id', { id })
      .andWhere('cv.deletedAt IS NULL')
      .getOne();

    if (!cv || !cv.application || cv.application.deletedAt !== null) {
      throw new NotFoundException({
        code: ErrorCodes.CV_NOT_FOUND,
        message: 'Không tìm thấy phiên bản CV',
      });
    }

    const isApplicationOwner = cv.application.ownerId === actor.userId;
    const isJobOwner = cv.application.job?.ownerId === actor.userId;

    if (!isCvAdmin && !isApplicationOwner && !isJobOwner) {
      throw new NotFoundException({
        code: ErrorCodes.CV_NOT_FOUND,
        message: 'Không tìm thấy phiên bản CV',
      });
    }

    return this.toDetailDto(cv);
  }

  /**
   * Tải file PDF nhị phân
   */
  async download(
    actor: ActorContext,
    id: string,
  ): Promise<{ stream: Readable; filename: string; sizeBytes: number }> {
    const isCvAdmin = await this.permissionsService.hasAll(actor.userId, [
      Permissions.CvManage,
    ]);

    const cv = await this.cvVersionRepository
      .createQueryBuilder('cv')
      .leftJoinAndSelect('cv.application', 'app')
      .leftJoinAndSelect('app.job', 'job')
      .where('cv.id = :id', { id })
      .andWhere('cv.deletedAt IS NULL')
      .getOne();

    if (!cv || !cv.application || cv.application.deletedAt !== null) {
      throw new NotFoundException({
        code: ErrorCodes.CV_NOT_FOUND,
        message: 'Không tìm thấy phiên bản CV',
      });
    }

    const isApplicationOwner = cv.application.ownerId === actor.userId;
    const isJobOwner = cv.application.job?.ownerId === actor.userId;

    if (!isCvAdmin && !isApplicationOwner && !isJobOwner) {
      throw new NotFoundException({
        code: ErrorCodes.CV_NOT_FOUND,
        message: 'Không tìm thấy phiên bản CV',
      });
    }

    let stream: Readable;
    try {
      stream = await this.documentStorage.get(cv.storageKey);
    } catch (err) {
      this.logger.error(`Failed to stream document ${cv.id}: ${String(err)}`);
      throw new NotFoundException({
        code: ErrorCodes.CV_STORAGE_ERROR,
        message: 'Không thể truy xuất file từ hệ thống lưu trữ',
      });
    }

    // Audit download
    await this.auditService.record({
      actorId: actor.userId,
      actorType: 'user',
      action: 'cv.downloaded',
      targetType: 'cv_version',
      targetId: cv.id,
      ownerId: cv.ownerId,
      requestId: actor.requestId,
      metadata: {
        applicationId: cv.applicationId,
        version: cv.version,
      },
    });

    return {
      stream,
      filename: cv.originalFilename,
      sizeBytes: Number(cv.sizeBytes),
    };
  }

  /**
   * Cập nhật profile thủ công
   */
  async updateProfile(
    actor: ActorContext,
    id: string,
    dto: UpdateCvProfileDto,
  ): Promise<CvVersionDetailDto> {
    const isCvAdmin = await this.permissionsService.hasAll(actor.userId, [
      Permissions.CvManage,
    ]);

    return this.dataSource.transaction(async (manager) => {
      const cvRepo = manager.getRepository(CvVersion);

      const cv = await cvRepo
        .createQueryBuilder('cv')
        .setLock('pessimistic_write')
        .where('cv.id = :id', { id })
        .andWhere('cv.deletedAt IS NULL')
        .getOne();

      if (!cv) {
        throw new NotFoundException({
          code: ErrorCodes.CV_NOT_FOUND,
          message: 'Không tìm thấy phiên bản CV',
        });
      }

      const application = await manager.getRepository(Application).findOne({
        where: { id: cv.applicationId },
      });

      if (!application || application.deletedAt !== null) {
        throw new NotFoundException({
          code: ErrorCodes.CV_NOT_FOUND,
          message: 'Không tìm thấy phiên bản CV',
        });
      }

      cv.application = application;

      const isApplicationOwner = cv.application.ownerId === actor.userId;
      if (!isCvAdmin && !isApplicationOwner) {
        throw new ForbiddenException({
          code: ErrorCodes.MISSING_PERMISSION,
          message:
            'Chỉ chủ sở hữu hồ sơ hoặc quản trị viên mới có quyền cập nhật profile',
        });
      }

      if (cv.application.status !== ApplicationStatus.SHORTLISTED) {
        throw new ConflictException({
          code: ErrorCodes.APPLICATION_STATE_CONFLICT,
          message: `Chỉ được cập nhật profile khi hồ sơ ở trạng thái shortlisted (hiện tại: ${cv.application.status})`,
        });
      }

      if (cv.profileStatus === CvProfileStatus.APPROVED) {
        throw new ConflictException({
          code: ErrorCodes.CV_PROFILE_LOCKED,
          message: 'Profile đã được duyệt (approved) và không thể chỉnh sửa',
        });
      }

      if (cv.profileVersion !== dto.expectedProfileVersion) {
        throw new VersionConflictException(
          `Phiên bản profile không khớp (hiện tại: ${cv.profileVersion}, yêu cầu: ${dto.expectedProfileVersion})`,
        );
      }

      // Replace profile atomically
      cv.profileJson = dto.profile;
      cv.profileVersion += 1;

      const saved = await cvRepo.save(cv);

      await this.auditService.record(
        {
          actorId: actor.userId,
          actorType: 'user',
          action: 'cv.profile_updated',
          targetType: 'cv_version',
          targetId: saved.id,
          ownerId: saved.ownerId,
          requestId: actor.requestId,
          metadata: {
            profileVersion: saved.profileVersion,
            hasSummary: !!saved.profileJson?.summary,
            skillsCount: saved.profileJson?.skills?.length || 0,
            experiencesCount: saved.profileJson?.experiences?.length || 0,
          },
        },
        manager,
      );

      return this.toDetailDto(saved);
    });
  }

  /**
   * Duyệt profile (Approve profile)
   */
  async approveProfile(
    actor: ActorContext,
    id: string,
    dto: ApproveCvProfileDto,
  ): Promise<CvVersionDetailDto> {
    const isCvAdmin = await this.permissionsService.hasAll(actor.userId, [
      Permissions.CvManage,
    ]);

    return this.dataSource.transaction(async (manager) => {
      const cvRepo = manager.getRepository(CvVersion);

      const cv = await cvRepo
        .createQueryBuilder('cv')
        .setLock('pessimistic_write')
        .where('cv.id = :id', { id })
        .andWhere('cv.deletedAt IS NULL')
        .getOne();

      if (!cv) {
        throw new NotFoundException({
          code: ErrorCodes.CV_NOT_FOUND,
          message: 'Không tìm thấy phiên bản CV',
        });
      }

      const application = await manager.getRepository(Application).findOne({
        where: { id: cv.applicationId },
      });

      if (!application || application.deletedAt !== null) {
        throw new NotFoundException({
          code: ErrorCodes.CV_NOT_FOUND,
          message: 'Không tìm thấy phiên bản CV',
        });
      }

      cv.application = application;

      const isApplicationOwner = cv.application.ownerId === actor.userId;
      if (!isCvAdmin && !isApplicationOwner) {
        throw new ForbiddenException({
          code: ErrorCodes.MISSING_PERMISSION,
          message:
            'Chỉ chủ sở hữu hồ sơ hoặc quản trị viên mới có quyền duyệt profile',
        });
      }

      if (cv.application.status !== ApplicationStatus.SHORTLISTED) {
        throw new ConflictException({
          code: ErrorCodes.APPLICATION_STATE_CONFLICT,
          message: `Chỉ được duyệt profile khi hồ sơ ở trạng thái shortlisted (hiện tại: ${cv.application.status})`,
        });
      }

      if (cv.profileStatus === CvProfileStatus.APPROVED) {
        throw new ConflictException({
          code: ErrorCodes.CV_PROFILE_LOCKED,
          message: 'Profile này đã được duyệt trước đó',
        });
      }

      if (cv.profileVersion !== dto.expectedProfileVersion) {
        throw new VersionConflictException(
          `Phiên bản profile không khớp (hiện tại: ${cv.profileVersion}, yêu cầu: ${dto.expectedProfileVersion})`,
        );
      }

      if (!cv.profileJson || cv.profileJson.schemaVersion !== 'profile.v1') {
        throw new ConflictException({
          code: ErrorCodes.CV_PROFILE_NOT_READY,
          message: 'Profile chưa sẵn sàng hoặc rỗng, không thể phê duyệt',
        });
      }

      cv.profileStatus = CvProfileStatus.APPROVED;
      cv.profileApprovedBy = actor.userId;
      cv.profileApprovedAt = new Date();
      cv.profileVersion += 1;

      const saved = await cvRepo.save(cv);

      await this.auditService.record(
        {
          actorId: actor.userId,
          actorType: 'user',
          action: 'cv.profile_approved',
          targetType: 'cv_version',
          targetId: saved.id,
          ownerId: saved.ownerId,
          requestId: actor.requestId,
          metadata: {
            profileVersion: saved.profileVersion,
            approvedBy: saved.profileApprovedBy,
          },
        },
        manager,
      );

      return this.toDetailDto(saved);
    });
  }

  /**
   * Xóa mềm (Soft delete) CV version - chỉ Admin có cv:manage
   */
  async remove(actor: ActorContext, id: string): Promise<void> {
    const isCvAdmin = await this.permissionsService.hasAll(actor.userId, [
      Permissions.CvManage,
    ]);

    if (!isCvAdmin) {
      throw new ForbiddenException({
        code: ErrorCodes.MISSING_PERMISSION,
        message: 'Chỉ quản trị viên có quyền cv:manage mới được xóa CV version',
      });
    }

    return this.dataSource.transaction(async (manager) => {
      const cvRepo = manager.getRepository(CvVersion);
      const appRepo = manager.getRepository(Application);

      const cv = await cvRepo.findOne({
        where: { id },
      });

      if (!cv || cv.deletedAt !== null) {
        throw new NotFoundException({
          code: ErrorCodes.CV_NOT_FOUND,
          message: 'Không tìm thấy phiên bản CV để xóa',
        });
      }

      // Soft delete database record
      await cvRepo.softDelete(id);

      // Check if this CV was the currentCvVersion of Application
      const application = await appRepo.findOne({
        where: { id: cv.applicationId },
      });

      if (application && application.currentCvVersionId === id) {
        // Find latest active CV version
        const latestActiveCv = await cvRepo
          .createQueryBuilder('c')
          .where('c.applicationId = :appId', { appId: application.id })
          .andWhere('c.deletedAt IS NULL')
          .orderBy('c.version', 'DESC')
          .getOne();

        application.currentCvVersionId = latestActiveCv
          ? latestActiveCv.id
          : null;
        application.version += 1;
        await appRepo.save(application);
      }

      await this.auditService.record(
        {
          actorId: actor.userId,
          actorType: 'user',
          action: 'cv.deleted',
          targetType: 'cv_version',
          targetId: cv.id,
          ownerId: cv.ownerId,
          requestId: actor.requestId,
          metadata: {
            applicationId: cv.applicationId,
            version: cv.version,
          },
        },
        manager,
      );
    });
  }

  private toSafeDto(cv: CvVersion): CvVersionSafeDto {
    return {
      id: cv.id,
      applicationId: cv.applicationId,
      version: cv.version,
      originalFilename: cv.originalFilename,
      mimeType: cv.mimeType,
      sizeBytes: Number(cv.sizeBytes),
      sha256: cv.sha256,
      extractionStatus: cv.extractionStatus,
      profileStatus: cv.profileStatus,
      profileVersion: cv.profileVersion,
      createdAt: cv.createdAt,
    };
  }

  private toDetailDto(cv: CvVersion): CvVersionDetailDto {
    return {
      ...this.toSafeDto(cv),
      ownerId: cv.ownerId,
      pageCount: cv.pageCount,
      processingVersion: cv.processingVersion,
      profileJson: cv.profileJson,
      profileApprovedBy: cv.profileApprovedBy,
      profileApprovedAt: cv.profileApprovedAt,
      errorCode: cv.errorCode,
      updatedAt: cv.updatedAt,
    };
  }
}
