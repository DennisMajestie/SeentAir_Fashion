import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type CustomerKind = 'stockist' | 'shopper';

@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({
    type: 'varchar',
    enum: ['stockist', 'shopper'],
  })
  kind: CustomerKind;

  @Column({ type: 'varchar', nullable: true })
  contact: string | null;

  @Column({ unique: true })
  email: string;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', nullable: true })
  city: string | null;

  @Column({ type: 'varchar', nullable: true })
  region: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'text', nullable: true })
  tags: string[] | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
