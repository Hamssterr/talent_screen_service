import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

export interface CreateAuditLogParams {
  actorId?: string | null;
  actorType?: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  ownerId?: string | null;
  metadata?: Record<string, unknown>;
  requestId?: string | null;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
  ) {}

  async record(
    params: CreateAuditLogParams,
    manager?: EntityManager,
  ): Promise<AuditLog> {
    const repo = manager
      ? manager.getRepository(AuditLog)
      : this.auditRepository;

    const log = repo.create({
      actorId: params.actorId ?? null,
      actorType: params.actorType ?? 'user',
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId ?? null,
      ownerId: params.ownerId ?? null,
      metadata: params.metadata ?? {},
      requestId: params.requestId ?? null,
    });

    return repo.save(log);
  }
}
