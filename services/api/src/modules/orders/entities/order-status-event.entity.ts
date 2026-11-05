import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Order } from './order.entity';

export type ActorKind = 'staff' | 'customer' | 'system';
export const PAYMENT_EXCEPTION_EVENT = 'payment_exception';

/** Timeline powering Temu-grade order tracking (appendix 09). */
@Entity('order_status_events')
@Index('IDX_order_status_events_order_created', ['order', 'createdAt'])
export class OrderStatusEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ type: 'varchar' })
  status: string;

  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  /** Who caused the transition. NULL for legacy rows and system-only paths. */
  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  /** 'staff' | 'customer' | 'system'. NULL for legacy rows. */
  @Column({ name: 'actor_kind', type: 'varchar', nullable: true })
  actorKind: ActorKind | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
