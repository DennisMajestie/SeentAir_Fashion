import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('notification_preferences')
export class NotificationPreference {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'jsonb', default: {} })
  preferences: Record<string, boolean>;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
