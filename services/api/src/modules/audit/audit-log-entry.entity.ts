import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * First-class audit record (appendix 19): actor, action, before/after state, timestamp.
 * Written automatically by AuditInterceptor — never manually per-feature.
 * Lives in the database, separate from ephemeral application logs.
 */
@Entity('audit_log_entries')
export class AuditLogEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @Index()
  @Column()
  action: string;

  @Column({ name: 'before_state', type: 'jsonb', nullable: true })
  beforeState: unknown | null;

  @Column({ name: 'after_state', type: 'jsonb', nullable: true })
  afterState: unknown | null;

  @Index()
  @CreateDateColumn({ name: 'timestamp' })
  timestamp: Date;

  /** Tamper-evidence chain (Phase 9): hash of the immediately preceding row. */
  @Column({ name: 'prev_hash', type: 'varchar', length: 64, nullable: true })
  prevHash: string | null;

  /** SHA-256 over prevHash + row contents — computed by a DB trigger on insert. */
  @Column({ name: 'entry_hash', type: 'varchar', length: 64, unique: true })
  entryHash: string;
}
