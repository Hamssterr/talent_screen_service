import {
  DataSource,
  EntityManager,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { JobsService } from './../jobs.service';
import { Job } from '../entities/job.entity';
import { PermissionsService } from 'src/modules/admin/permissions/permissions.service';
import { AuditService } from 'src/platform/audit';
import { ActorContext } from 'src/common/context/actor-context';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JobStatus } from '../enums/job-status.enum';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { JobListScope } from '../enums/job-list-scope.enum';
import { VersionConflictException } from 'src/common/dto/expected-version.dto';

describe('JobsService', () => {
  let service: JobsService;
  let jobRepo: jest.Mocked<Repository<Job>>;
  let permissionsService: jest.Mocked<PermissionsService>;
  let auditService: jest.Mocked<AuditService>;
  let mockManager: Partial<EntityManager>;
  let mockTxJobRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
  };

  // Mock Actor (người đang thực hiện request)
  const mockActor: ActorContext = {
    userId: '11111111-1111-4000-8000-111111111111',
    email: 'hr@example.com',
    requestId: 'req-test-123',
  };
  const hrActor: ActorContext = mockActor;
  const adminActor: ActorContext = {
    userId: '00000000-0000-4000-8000-000000000001',
    email: 'admin@example.com',
    requestId: 'req-admin-123',
  };
  const otherUserId = '22222222-2222-4000-8000-222222222222';

  const createSampleJob = (overrides: Partial<Job> = {}): Job => {
    return {
      id: 'job-uuid-1',
      ownerId: mockActor.userId,
      title: 'Backend Developer',
      description: 'Lập trình NestJS & PostgreSQL',
      requiredSkills: ['NestJS', 'PostgreSQL'],
      evaluationCriteria: [
        {
          id: 'crit-1',
          name: 'Kỹ năng NestJS',
          description: 'Nắm vững DI, Modules, Guards',
        },
      ],
      status: JobStatus.DRAFT,
      version: 1,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      deletedAt: null,
      ...overrides,
    };
  };
  beforeEach(async () => {
    // 1. Giả lập Transaction Manager
    mockTxJobRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn((job) => Promise.resolve({ id: 'job-uuid-1', ...job })),
      findOne: jest.fn(),
    };
    mockManager = {
      getRepository: jest.fn().mockReturnValue(mockTxJobRepo),
    };
    // 2. Giả lập DataSource.transaction thực thi ngay callback với mockManager
    const mockDataSource = {
      transaction: jest
        .fn()
        .mockImplementation((cb: (manager: EntityManager) => any) => {
          return cb(mockManager as EntityManager);
        }),
    };
    // 3. Giả lập Repository
    const mockJobRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    // 4. Giả lập PermissionsService và AuditService
    const mockPermissionsService = {
      hasAll: jest.fn().mockResolvedValue(false), // Mặc định là HR thường, không có jobs:manage
    };
    const mockAuditService = {
      record: jest.fn().mockResolvedValue({} as any),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: getRepositoryToken(Job), useValue: mockJobRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: PermissionsService, useValue: mockPermissionsService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();
    service = module.get<JobsService>(JobsService);
    jobRepo = module.get(getRepositoryToken(Job));
    permissionsService = module.get(PermissionsService);
    auditService = module.get(AuditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================
  // TEST CASE CHO: create()
  // ==========================================
  describe('create', () => {
    it('Tạo Job thành công và tự động hóa requiredSkills', async () => {
      const dto = {
        title: '  Backend NodeJS  ',
        description: 'Mô tả công việc...',
        requiredSkills: ['NodeJS', '  nodejs  ', 'TypeScript'], // Có trùng hoa/thường và khoảng trắng
        status: JobStatus.DRAFT,
        evaluationCriteria: [
          {
            name: ' Kiến trúc hệ thống ',
            description: ' Hiểu Microservices & Monolith ',
          },
        ],
      };

      const result = await service.create(mockActor, dto as any);

      // 1. Kiểm tra kết quả trả về
      expect(result).toBeDefined();
      expect(result.title).toBe('Backend NodeJS');
      expect(result.ownerId).toBe(mockActor.userId);
      expect(result.version).toBe(1);
      expect(result.ownerId).toBe(mockActor.userId);

      // 2. Kiểm tra kỹ năng được normalize (chỉ còn 2 phần tử, không trùng lặp)
      expect(result.requiredSkills).toEqual(['NodeJS', 'TypeScript']);

      // 3. Kiểm tra evaluation criteria được tự sinh UUID khi chưa có
      expect(result.evaluationCriteria).toHaveLength(1);
      expect(result.evaluationCriteria[0].id).toBeDefined();
      expect(result.evaluationCriteria[0].name).toBe('Kiến trúc hệ thống');
      expect(result.evaluationCriteria[0].description).toBe(
        'Hiểu Microservices & Monolith',
      );

      // 4. Kiểm tra có ghi audit log không
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'job.created',
          targetType: 'job',
          actorId: mockActor.userId,
        }),
        mockManager,
      );
    });

    it('Cho phép tạo trực tiếp Job ở trạng thái OPEN', async () => {
      const dto = {
        title: 'Frontend Engineer',
        description: 'Mô tả công việc...',
        status: JobStatus.OPEN,
      };

      const result = await service.create(mockActor, dto as any);

      expect(result.status).toBe(JobStatus.OPEN);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'job.created',
          metadata: expect.objectContaining({ status: JobStatus.OPEN }),
        }),
        mockManager,
      );
    });

    it('Nên ném BadRequestException nếu cố tạo Job trực tiếp với status closed', async () => {
      const dto = {
        title: 'Backend',
        description: 'Mô tả',
        status: JobStatus.CLOSED,
      };

      await expect(service.create(mockActor, dto as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('Xử lý an toàn khi requiredSkills và evaluationCriteria để rỗng', async () => {
      const dto = {
        title: 'Minimal Job',
        description: 'Mô tả cơ bản',
      };

      const result = await service.create(mockActor, dto);

      expect(result.requiredSkills).toEqual([]);
      expect(result.evaluationCriteria).toEqual([]);
    });
  });

  // =========================================================================
  // 2. FIND ALL (LIST WITH SCOPE & PAGINATION)
  // =========================================================================
  describe('findAll', () => {
    let qb: any;

    beforeEach(() => {
      qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[createSampleJob()], 1]),
      };
      jobRepo.createQueryBuilder.mockReturnValue(qb);
    });

    it('Scope ALL cho HR thường: lọc Job của mình hoặc Job OPEN của HR khác', async () => {
      permissionsService.hasAll.mockResolvedValue(false);

      const result = await service.findAll(hrActor, {
        page: 1,
        limit: 10,
        scope: JobListScope.ALL,
      } as any);

      expect(qb.where).toHaveBeenCalledWith('job.deletedAt IS NULL');
      expect(qb.andWhere).toHaveBeenCalledWith(
        '(job.ownerId = :userId OR job.status = :openStatus)',
        { userId: hrActor.userId, openStatus: JobStatus.OPEN },
      );
      expect(qb.orderBy).toHaveBeenCalledWith('job.createdAt', 'DESC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('job.id', 'DESC');
      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(10);
      expect(result.data).toHaveLength(1);
      expect(result.meta.totalItems).toBe(1);
    });

    it('Scope ALL cho Admin có jobs:manage: không bị ràng buộc bởi owner', async () => {
      permissionsService.hasAll.mockResolvedValue(true);

      await service.findAll(adminActor, {
        page: 1,
        limit: 10,
        scope: JobListScope.ALL,
      } as any);

      expect(qb.where).toHaveBeenCalledWith('job.deletedAt IS NULL');
      // Không gọi andWhere ràng buộc ownerId hay openStatus
      expect(qb.andWhere).not.toHaveBeenCalledWith(
        '(job.ownerId = :userId OR job.status = :openStatus)',
        expect.anything(),
      );
    });

    it('Scope MINE: chỉ lấy Job do chính mình tạo', async () => {
      permissionsService.hasAll.mockResolvedValue(false);

      await service.findAll(mockActor, {
        page: 2,
        limit: 5,
        scope: JobListScope.MINE,
      } as any);

      expect(qb.andWhere).toHaveBeenCalledWith('job.ownerId = :userId', {
        userId: mockActor.userId,
      });
      expect(qb.skip).toHaveBeenCalledWith(5);
      expect(qb.take).toHaveBeenCalledWith(5);
    });

    it('Scope SHARED: chỉ lấy Job OPEN do HR khác tạo', async () => {
      permissionsService.hasAll.mockResolvedValue(false);

      await service.findAll(mockActor, {
        scope: JobListScope.SHARED,
      } as any);

      expect(qb.andWhere).toHaveBeenCalledWith(
        'job.ownerId != :userId AND job.status = :openStatus',
        { userId: mockActor.userId, openStatus: JobStatus.OPEN },
      );
    });

    it('Lọc thêm theo status nếu client truyền query status', async () => {
      permissionsService.hasAll.mockResolvedValue(false);

      await service.findAll(mockActor, {
        status: JobStatus.OPEN,
      } as any);

      expect(qb.andWhere).toHaveBeenCalledWith('job.status = :status', {
        status: JobStatus.OPEN,
      });
    });
  });

  // =========================================================================
  // 3. FIND ONE (DETAIL BY ID)
  // =========================================================================
  describe('findOne', () => {
    it('Owner xem được Job DRAFT của chính mình', async () => {
      const sample = createSampleJob({
        status: JobStatus.DRAFT,
        ownerId: hrActor.userId,
      });
      jobRepo.findOne.mockResolvedValue(sample);
      permissionsService.hasAll.mockResolvedValue(false);

      const result = await service.findOne(hrActor, sample.id);

      expect(result).toBeDefined();
      expect(result.id).toBe(sample.id);
      expect(result.status).toBe(JobStatus.DRAFT);
    });

    it('Owner xem được Job CLOSED của chính mình', async () => {
      const sample = createSampleJob({
        status: JobStatus.CLOSED,
        ownerId: hrActor.userId,
      });
      jobRepo.findOne.mockResolvedValue(sample);
      permissionsService.hasAll.mockResolvedValue(false);

      const result = await service.findOne(hrActor, sample.id);

      expect(result).toBeDefined();
      expect(result.status).toBe(JobStatus.CLOSED);
    });

    it('HR khác xem được Job khi trạng thái là OPEN', async () => {
      const sample = createSampleJob({
        status: JobStatus.OPEN,
        ownerId: otherUserId,
      });
      jobRepo.findOne.mockResolvedValue(sample);
      permissionsService.hasAll.mockResolvedValue(false);

      const result = await service.findOne(hrActor, sample.id);

      expect(result).toBeDefined();
      expect(result.status).toBe(JobStatus.OPEN);
    });

    it('HR khác KHÔNG xem được Job DRAFT của người khác -> Ném 404', async () => {
      const sample = createSampleJob({
        status: JobStatus.DRAFT,
        ownerId: otherUserId,
      });
      jobRepo.findOne.mockResolvedValue(sample);
      permissionsService.hasAll.mockResolvedValue(false);

      await expect(service.findOne(hrActor, sample.id)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('HR khác KHÔNG xem được Job CLOSED của người khác -> Ném 404', async () => {
      const sample = createSampleJob({
        status: JobStatus.CLOSED,
        ownerId: otherUserId,
      });
      jobRepo.findOne.mockResolvedValue(sample);
      permissionsService.hasAll.mockResolvedValue(false);

      await expect(service.findOne(hrActor, sample.id)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('Admin có jobs:manage xem được bất kỳ Job nào (kể cả DRAFT hay CLOSED của HR khác)', async () => {
      const sample = createSampleJob({
        status: JobStatus.DRAFT,
        ownerId: otherUserId,
      });
      jobRepo.findOne.mockResolvedValue(sample);
      permissionsService.hasAll.mockResolvedValue(true);

      const result = await service.findOne(adminActor, sample.id);

      expect(result).toBeDefined();
      expect(result.id).toBe(sample.id);
    });

    it('Ném 404 nếu Job không tồn tại trong database', async () => {
      jobRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(hrActor, 'non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // 4. UPDATE (OPTIMISTIC LOCK & STATUS TRANSITIONS)
  // =========================================================================
  describe('update', () => {
    it('Cập nhật Job thành công: tăng version đúng 1 lần và ghi audit job.updated', async () => {
      const sample = createSampleJob({ version: 1, status: JobStatus.DRAFT });
      mockTxJobRepo.findOne.mockResolvedValue(sample);
      mockTxJobRepo.save.mockImplementation(async (j) => j);
      permissionsService.hasAll.mockResolvedValue(false);

      const dto = {
        expectedVersion: 1,
        title: '  Senior NestJS Engineer  ',
      };

      const result = await service.update(hrActor, sample.id, dto);

      expect(result.version).toBe(2);
      expect(result.title).toBe('Senior NestJS Engineer');

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'job.updated',
          targetId: sample.id,
          metadata: expect.objectContaining({
            previousVersion: 1,
            newVersion: 2,
          }),
        }),
        mockManager,
      );
    });

    it('Ghi nhận audit job.opened khi chuyển trạng thái từ DRAFT sang OPEN', async () => {
      const sample = createSampleJob({ version: 2, status: JobStatus.DRAFT });
      mockTxJobRepo.findOne.mockResolvedValue(sample);
      mockTxJobRepo.save.mockImplementation(async (j) => j);
      permissionsService.hasAll.mockResolvedValue(false);

      const dto = {
        expectedVersion: 2,
        status: JobStatus.OPEN,
      };

      await service.update(hrActor, sample.id, dto as any);

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'job.opened',
          targetId: sample.id,
        }),
        mockManager,
      );
    });

    it('Admin có jobs:manage có quyền sửa Job của HR khác', async () => {
      const sample = createSampleJob({
        ownerId: otherUserId,
        version: 1,
        status: JobStatus.DRAFT,
      });
      mockTxJobRepo.findOne.mockResolvedValue(sample);
      mockTxJobRepo.save.mockImplementation(async (j) => j);
      permissionsService.hasAll.mockResolvedValue(true);

      const dto = {
        expectedVersion: 1,
        title: 'Admin Edited Title',
      };

      const result = await service.update(adminActor, sample.id, dto);

      expect(result.title).toBe('Admin Edited Title');
    });

    it('HR thường không được sửa Job của người khác -> Ném 404', async () => {
      const sample = createSampleJob({
        ownerId: otherUserId,
        version: 1,
        status: JobStatus.DRAFT,
      });
      mockTxJobRepo.findOne.mockResolvedValue(sample);
      permissionsService.hasAll.mockResolvedValue(false);

      const dto = { expectedVersion: 1, title: 'Hacked' };

      await expect(
        service.update(hrActor, sample.id, dto as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('Ném VersionConflictException (409) khi expectedVersion không khớp version hiện tại', async () => {
      const sample = createSampleJob({ version: 2 });
      mockTxJobRepo.findOne.mockResolvedValue(sample);
      permissionsService.hasAll.mockResolvedValue(false);

      const dto = { expectedVersion: 1, title: 'Outdated' };

      await expect(
        service.update(hrActor, sample.id, dto as any),
      ).rejects.toThrow(VersionConflictException);
    });

    it('Ném BadRequestException nếu Job đã CLOSED', async () => {
      const sample = createSampleJob({ version: 1, status: JobStatus.CLOSED });
      mockTxJobRepo.findOne.mockResolvedValue(sample);
      permissionsService.hasAll.mockResolvedValue(false);

      const dto = { expectedVersion: 1, title: 'Cannot edit closed' };

      await expect(
        service.update(hrActor, sample.id, dto as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('Ném BadRequestException nếu cố tình đóng Job qua PATCH (phải dùng endpoint /close)', async () => {
      const sample = createSampleJob({ version: 1, status: JobStatus.OPEN });
      mockTxJobRepo.findOne.mockResolvedValue(sample);
      permissionsService.hasAll.mockResolvedValue(false);

      const dto = { expectedVersion: 1, status: JobStatus.CLOSED };

      await expect(
        service.update(hrActor, sample.id, dto as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('Ném BadRequestException nếu cố tình chuyển từ OPEN về DRAFT', async () => {
      const sample = createSampleJob({ version: 1, status: JobStatus.OPEN });
      mockTxJobRepo.findOne.mockResolvedValue(sample);
      permissionsService.hasAll.mockResolvedValue(false);

      const dto = { expectedVersion: 1, status: JobStatus.DRAFT };

      await expect(
        service.update(hrActor, sample.id, dto as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // 5. CLOSE JOB
  // =========================================================================
  describe('close', () => {
    it('Đóng Job thành công: chuyển sang CLOSED, tăng version và ghi audit job.closed', async () => {
      const sample = createSampleJob({ version: 1, status: JobStatus.OPEN });
      mockTxJobRepo.findOne.mockResolvedValue(sample);
      mockTxJobRepo.save.mockImplementation(async (j) => j);
      permissionsService.hasAll.mockResolvedValue(false);

      const result = await service.close(hrActor, sample.id, {
        expectedVersion: 1,
      });

      expect(result.status).toBe(JobStatus.CLOSED);
      expect(result.version).toBe(2);

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'job.closed',
          targetId: sample.id,
          metadata: expect.objectContaining({
            previousStatus: JobStatus.OPEN,
            newStatus: JobStatus.CLOSED,
            previousVersion: 1,
            newVersion: 2,
          }),
        }),
        mockManager,
      );
    });

    it('Admin có jobs:manage có thể đóng Job của HR khác', async () => {
      const sample = createSampleJob({
        ownerId: otherUserId,
        version: 1,
        status: JobStatus.OPEN,
      });
      mockTxJobRepo.findOne.mockResolvedValue(sample);
      mockTxJobRepo.save.mockImplementation(async (j) => j);
      permissionsService.hasAll.mockResolvedValue(true);

      const result = await service.close(adminActor, sample.id, {
        expectedVersion: 1,
      });

      expect(result.status).toBe(JobStatus.CLOSED);
    });

    it('HR thường không được đóng Job của người khác -> Ném 404', async () => {
      const sample = createSampleJob({
        ownerId: otherUserId,
        version: 1,
        status: JobStatus.OPEN,
      });
      mockTxJobRepo.findOne.mockResolvedValue(sample);
      permissionsService.hasAll.mockResolvedValue(false);

      await expect(
        service.close(hrActor, sample.id, { expectedVersion: 1 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('Ném VersionConflictException (409) khi đóng Job nếu version không khớp', async () => {
      const sample = createSampleJob({ version: 2, status: JobStatus.OPEN });
      mockTxJobRepo.findOne.mockResolvedValue(sample);
      permissionsService.hasAll.mockResolvedValue(false);

      await expect(
        service.close(hrActor, sample.id, { expectedVersion: 1 }),
      ).rejects.toThrow(VersionConflictException);
    });

    it('Ném BadRequestException nếu Job vốn dĩ đã CLOSED', async () => {
      const sample = createSampleJob({ version: 1, status: JobStatus.CLOSED });
      mockTxJobRepo.findOne.mockResolvedValue(sample);
      permissionsService.hasAll.mockResolvedValue(false);

      await expect(
        service.close(hrActor, sample.id, { expectedVersion: 1 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // 6. SOFT DELETE
  // =========================================================================
  describe('softDelete', () => {
    it('Soft delete Job thành công: gán deletedAt và ghi audit log job.deleted', async () => {
      const sample = createSampleJob();
      mockTxJobRepo.findOne.mockResolvedValue(sample);
      mockTxJobRepo.save.mockImplementation(async (j) => j);

      const result = await service.softDelete(adminActor, sample.id);

      expect(result.message).toBe('Đã xóa vị trí tuyển dụng thành công');
      expect(sample.deletedAt).toBeInstanceOf(Date);

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'job.deleted',
          targetId: sample.id,
        }),
        mockManager,
      );
    });

    it('Ném 404 nếu Job cần xóa không tồn tại hoặc đã bị xóa trước đó', async () => {
      mockTxJobRepo.findOne.mockResolvedValue(null);

      await expect(
        service.softDelete(adminActor, 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
