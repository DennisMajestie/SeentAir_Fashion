import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Why a loyalty balance moved. Order awards are idempotent per order. */
export enum LoyaltyEntryReason {
  ORDER_DELIVERED = 'order_delivered',
  RETURN_REVERSAL = 'return_reversal',
  ADMIN_ADJUST = 'admin_adjust',
}

@Entity('loyalty_entries')
export class LoyaltyEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_loyalty_entry_customer')
  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId: string | null;

  @Column({ type: 'int' })
  points: number;

  @Column({ type: 'enum', enum: LoyaltyEntryReason })
  reason: LoyaltyEntryReason;

  @Column({ type: 'varchar', length: 180 })
  note: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
