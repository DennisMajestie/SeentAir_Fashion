import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { numericTransformer } from '../../../common/numeric.transformer';

/**
 * Certified-mill directory (Phase 9): supplier cards with SLA scores, quota
 * contracts and compliance notes. Per-purchase price/lead/supplier history
 * stays on material_purchases (materials stay the ledger's source of truth).
 */
@Entity('suppliers')
export class Supplier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  name: string;

  /** fabrics | trims_hardware | thread | packaging | printing | labels | other */
  @Column({ type: 'varchar', nullable: true })
  category: string | null;

  @Column({ type: 'varchar', nullable: true })
  location: string | null;

  @Column({ type: 'boolean', default: false })
  certified: boolean;

  /** 0–100 SLA score (delivery lead-time + quality record). */
  @Column({ name: 'sla_score', type: 'numeric', precision: 5, scale: 2, nullable: true, transformer: numericTransformer })
  slaScore: number | null;

  /** Quota contract: target units this period. */
  @Column({ name: 'quota_units', type: 'integer', nullable: true })
  quotaUnits: number | null;

  @Column({ name: 'compliance_notes', type: 'text', nullable: true })
  complianceNotes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}