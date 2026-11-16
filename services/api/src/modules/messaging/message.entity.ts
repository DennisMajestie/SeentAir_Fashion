import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** in = written by the customer; out = written by staff (or the platform). */
export enum MessageDirection {
  IN = 'in',
  OUT = 'out',
}

@Entity('messages')
@Index('IDX_messages_conversation_created_at', ['conversationId', 'createdAt'])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId: string;

  @Column({ type: 'enum', enum: MessageDirection })
  direction: MessageDirection;

  /** Staff author for outbound messages; null for inbound/guest/system notes. */
  @Column({ name: 'author_user_id', type: 'uuid', nullable: true })
  authorUserId: string | null;

  /** Denormalised author name so thread reads need no user join. */
  @Column({ name: 'author_name', type: 'varchar', length: 120, nullable: true })
  authorName: string | null;

  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'attachment_url', type: 'varchar', length: 512, nullable: true })
  attachmentUrl: string | null;

  /** Provider message id once the channel adapter (WhatsApp/SMS) accepted it. */
  @Column({ name: 'provider_ref', type: 'varchar', length: 255, nullable: true })
  providerRef: string | null;

  /**
   * When the receiving side read it: inbound messages are stamped when staff
   * read, outbound when the customer read. Kept in step with the unread
   * counters on the conversation row.
   */
  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
