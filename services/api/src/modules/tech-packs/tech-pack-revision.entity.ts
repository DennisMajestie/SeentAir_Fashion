import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TechPack } from './tech-pack.entity';

/** Immutable snapshot of a tech pack at a given revision number. */
@Entity('tech_pack_revisions')
export class TechPackRevision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => TechPack, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tech_pack_id' })
  techPack: TechPack;

  @Column({ type: 'integer' })
  revision: number;

  @Column({ type: 'jsonb' })
  snapshot: unknown;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Index()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}