import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Single-use, short-lived email verification tokens. Same shape and same
 * protections as PasswordResetToken: only the SHA-256 hash is stored, and
 * issuing a new one invalidates prior unused tokens.
 *
 * Verification exists for one reason: guest orders are claimed by matching the
 * email on the order, so without proof of control anyone could register with a
 * stranger's address and inherit their order history and home address.
 */
@Entity('email_verification_tokens')
export class EmailVerificationToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Index({ unique: true })
  @Column({ name: 'token_hash', type: 'varchar' })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
