import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { numericTransformer } from '../../../common/numeric.transformer';
import { RawMaterial } from './raw-material.entity';

@Entity('material_purchases')
export class MaterialPurchase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => RawMaterial, { eager: true })
  @JoinColumn({ name: 'material_id' })
  material: RawMaterial;

  @Column({ type: 'integer' })
  quantity: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  cost: number;

  /** Optional free-text note (e.g. who it was bought from) — never a structured supplier field. */
  @Column({ type: 'text', nullable: true })
  note: string | null;

  /** Per-purchase supplier name — the certified-mill directory is in `suppliers`. */
  @Column({ name: 'supplier_name', type: 'varchar', nullable: true })
  supplierName: string | null;

  /** Supplier lead time for this purchase (days) — feeds SLA/quota history. */
  @Column({ name: 'lead_time_days', type: 'integer', nullable: true })
  leadTimeDays: number | null;

  @Column({ name: 'recorded_by', type: 'uuid', nullable: true })
  recordedBy: string | null;

  @CreateDateColumn({ name: 'purchased_at' })
  purchasedAt: Date;
}
