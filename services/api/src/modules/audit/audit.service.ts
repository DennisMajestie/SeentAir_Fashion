import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogEntry } from './audit-log-entry.entity';

export interface AuditRecordInput {
  actorId: string | null;
  action: string;
  beforeState?: unknown;
  afterState?: unknown;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLogEntry)
    private readonly auditRepo: Repository<AuditLogEntry>,
  ) {}

  async record(input: AuditRecordInput): Promise<AuditLogEntry> {
    const entry = this.auditRepo.create({
      actorId: input.actorId,
      action: input.action,
      beforeState: input.beforeState ?? null,
      afterState: input.afterState ?? null,
    });
    return this.auditRepo.save(entry);
  }

  async query(options: {
    actorId?: string;
    action?: string;
    from?: Date;
    to?: Date;
    page?: number;
    limit?: number;
  }): Promise<{ data: AuditLogEntry[]; total: number }> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 50;
    const qb = this.auditRepo
      .createQueryBuilder('entry')
      .orderBy('entry.timestamp', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    if (options.actorId) qb.andWhere('entry.actor_id = :actorId', { actorId: options.actorId });
    if (options.action) qb.andWhere('entry.action ILIKE :action', { action: `%${options.action}%` });
    if (options.from) qb.andWhere('entry.timestamp >= :from', { from: options.from });
    if (options.to) qb.andWhere('entry.timestamp <= :to', { to: options.to });
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
