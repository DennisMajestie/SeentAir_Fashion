import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Every provider webhook event we have acted on, claimed with
 * INSERT … ON CONFLICT DO NOTHING inside the processing transaction. A
 * duplicate delivery finds the row and is acknowledged without reprocessing;
 * a rolled-back attempt leaves no row, so the provider's retry proceeds.
 */
@Entity('processed_webhook_events')
@Index('IDX_webhook_event_provider_id', ['provider', 'eventId'], { unique: true })
export class ProcessedWebhookEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 40 })
  provider: string;

  @Column({ name: 'event_id', type: 'varchar', length: 200 })
  eventId: string;

  @CreateDateColumn({ name: 'received_at', type: 'timestamptz' })
  receivedAt: Date;
}
