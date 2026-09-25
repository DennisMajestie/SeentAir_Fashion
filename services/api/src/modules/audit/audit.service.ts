import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
    @InjectDataSource() private readonly dataSource: DataSource,
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

  /**
   * Recompute the hash chain for the whole ledger in the database — the exact
   * same expression the insert trigger uses — and report integrity. Any row
   * whose entry_hash does not match its contents+link (or that dangles from a
   * missing predecessor) is counted as broken.
   */
  async verify(): Promise<{
    total: number;
    valid: number;
    broken: number;
    headHash: string | null;
  }> {
    const rows: Array<{
      total: string;
      valid: string;
      broken: string;
      head_hash: string | null;
    }> = await this.dataSource.query(
      `WITH linked AS (
         SELECT id,
                "timestamp",
                prev_hash,
                entry_hash,
                seentair_chain_hash(
                  id,
                  prev_hash,
                  action,
                  before_state,
                  after_state,
                  "timestamp") AS expected_hash,
                (prev_hash IS NOT NULL AND NOT EXISTS (
                  SELECT 1 FROM audit_log_entries p WHERE p.entry_hash = audit_log_entries.prev_hash
                )) AS dangling
         FROM audit_log_entries
       )
       SELECT count(*)::text AS total,
              count(*) FILTER (WHERE entry_hash = expected_hash AND NOT dangling)::text AS valid,
              count(*) FILTER (WHERE entry_hash IS DISTINCT FROM expected_hash OR dangling)::text AS broken,
              (SELECT entry_hash FROM audit_log_entries ORDER BY "timestamp" DESC, id DESC LIMIT 1) AS head_hash
       FROM linked`,
    );
    const row = rows[0];
    return {
      total: parseInt(row?.total ?? '0', 10),
      valid: parseInt(row?.valid ?? '0', 10),
      broken: parseInt(row?.broken ?? '0', 10),
      headHash: row?.head_hash ?? null,
    };
  }
}
