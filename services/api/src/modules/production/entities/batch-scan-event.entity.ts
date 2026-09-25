import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ProductionBatch } from './production-batch.entity';

/** Floor-kiosk barcode scan event: an operator scans a batch at a stage gate. */
@Entity('batch_scan_events')
export class BatchScanEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ProductionBatch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'batch_id' })
  batch: ProductionBatch;

  /** Stage-gate event: cut_start, cut_done, sewing_start, finishing, qc, … */
  @Column({ name: 'event_type', type: 'varchar' })
  eventType: string;

  @Column({ name: 'operator_id', type: 'uuid', nullable: true })
  operatorId: string | null;

  /** Units scanned at the gate (defaults to the batch quantity). */
  @Column({ name: 'scanned_qty', type: 'integer', nullable: true })
  scannedQty: number | null;

  @Index()
  @CreateDateColumn({ name: 'scanned_at' })
  scannedAt: Date;
}