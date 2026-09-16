import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Server-side refresh-token registry: enables rotation, real logout, and
 * stolen-token detection. The JWT carries this row's id as `jti`; a refresh
 * is only honoured while the row is unrevoked and unexpired. Reuse of a
 * rotated (revoked) token revokes the user's entire session family.
 */
@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  /** Set when rotated — points to the replacing token (audit trail of the chain). */
  @Column({ name: 'replaced_by', type: 'uuid', nullable: true })
  replacedBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
