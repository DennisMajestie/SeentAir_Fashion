import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AccessLevel, ModuleName } from '../../../common/enums';
import { Role } from './role.entity';

/** One row per (role, module) from docs/project/05-Role-Permission-Matrix.md. */
@Entity('permissions')
@Index(['role', 'module'], { unique: true })
export class Permission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Role, (role) => role.permissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @Column({ type: 'enum', enum: ModuleName })
  module: ModuleName;

  @Column({ name: 'access_level', type: 'enum', enum: AccessLevel, default: AccessLevel.NONE })
  accessLevel: AccessLevel;
}
