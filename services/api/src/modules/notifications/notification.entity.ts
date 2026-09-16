import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum NotificationChannel {
  IN_PLATFORM = 'in_platform',
  SMS = 'sms',
  WHATSAPP = 'whatsapp',
}

export enum NotificationStatus {
  SENT = 'sent',
  FAILED = 'failed',
  SKIPPED = 'skipped', // provider not configured — recorded, not silently dropped
}

/** Communication centered on orders and delivery (appendix 20). */
@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'recipient_id', type: 'uuid' })
  recipientId: string;

  @Column({ type: 'enum', enum: NotificationChannel })
  channel: NotificationChannel;

  /** order_status | payment | return | approval | generic */
  @Column({ type: 'varchar' })
  type: string;

  @Column({ name: 'related_order_id', type: 'uuid', nullable: true })
  relatedOrderId: string | null;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'enum', enum: NotificationStatus, default: NotificationStatus.SENT })
  status: NotificationStatus;

  @Column({ name: 'provider_ref', type: 'varchar', nullable: true })
  providerRef: string | null;

  @CreateDateColumn({ name: 'sent_at' })
  sentAt: Date;
}
