import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Lets a guest open their own order with no account. Only the SHA-256 hash is
 * stored, so a database leak yields nothing openable — the same protection
 * password reset tokens get.
 *
 * Unlike a reset token this is deliberately NOT single-use: the customer opens
 * their tracking link repeatedly over the life of the delivery. It is therefore
 * long-lived, and its only power is to read one order in the customer-facing
 * shape. It never confers staff visibility and never authorises a write.
 */
@Entity('order_access_tokens')
export class OrderAccessToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @Index({ unique: true })
  @Column({ name: 'token_hash', type: 'varchar' })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
