import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ConversationChannel {
  IN_PLATFORM = 'in_platform',
  WHATSAPP = 'whatsapp',
  SMS = 'sms',
  EMAIL = 'email',
}

export enum ConversationStatus {
  OPEN = 'open',
  /** Waiting on the customer (staff replied) or on staff (customer replied). */
  PENDING = 'pending',
  CLOSED = 'closed',
}

/**
 * One thread with one customer (appendix 20: communication centered on orders).
 *
 * A conversation is owned either by a signed-in user (`customerId`) or by a
 * guest holding the one plaintext token whose sha256 lives in
 * `guestTokenHash` — the same authenticate-by-secret pattern the order guest
 * links use. The token never comes back from the API after creation.
 */
@Entity('conversations')
@Index('IDX_conversations_status_last_message', ['status', 'lastMessageAt'])
@Index('IDX_conversations_customer', ['customerId'])
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId: string | null;

  @Column({ name: 'guest_token_hash', type: 'varchar', length: 64, nullable: true })
  guestTokenHash: string | null;

  @Column({ name: 'guest_name', type: 'varchar', length: 120, nullable: true })
  guestName: string | null;

  @Column({ name: 'guest_email', type: 'varchar', length: 180, nullable: true })
  guestEmail: string | null;

  @Column({ name: 'guest_phone', type: 'varchar', length: 32, nullable: true })
  guestPhone: string | null;

  /** The channel the conversation lives on. Replies ride the same channel. */
  @Column({ type: 'enum', enum: ConversationChannel, default: ConversationChannel.IN_PLATFORM })
  channel: ConversationChannel;

  @Column({ type: 'enum', enum: ConversationStatus, default: ConversationStatus.OPEN })
  status: ConversationStatus;

  @Column({ name: 'related_order_id', type: 'uuid', nullable: true })
  relatedOrderId: string | null;

  @Column({ type: 'varchar', length: 180, nullable: true })
  subject: string | null;

  @Column({ name: 'assignee_id', type: 'uuid', nullable: true })
  assigneeId: string | null;

  @Column({ name: 'last_message_at', type: 'timestamptz', nullable: true })
  lastMessageAt: Date | null;

  /** Head of the last message, so the thread list needs no join. */
  @Column({ name: 'last_message_preview', type: 'varchar', length: 140, nullable: true })
  lastMessagePreview: string | null;

  /** Messages from the customer staff has not read yet. */
  @Column({ name: 'unread_staff', type: 'integer', default: 0 })
  unreadStaff: number;

  /** Messages from staff the customer has not read yet. */
  @Column({ name: 'unread_customer', type: 'integer', default: 0 })
  unreadCustomer: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /** Joined display name, filled by the service for staff surfaces; not a column. */
  customerName?: string | null;
}
