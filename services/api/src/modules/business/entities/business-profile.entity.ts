import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { numericTransformer } from '../../../common/numeric.transformer';

@Entity('business_profile')
export class BusinessProfile {
  @PrimaryColumn({ type: 'integer' })
  id: number;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ name: 'legal_name', type: 'varchar', length: 200, nullable: true })
  legalName: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  email: string | null;

  @Column({ name: 'tax_id', type: 'varchar', length: 60, nullable: true })
  taxId: string | null;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'varchar', length: 64 })
  timezone: string;

  @Column({ name: 'fiscal_start', type: 'varchar', length: 16 })
  fiscalStart: string;

  @Column({ name: 'factory_name', type: 'varchar', length: 160, nullable: true })
  factoryName: string | null;

  @Column({ name: 'factory_city', type: 'varchar', length: 120, nullable: true })
  factoryCity: string | null;

  @Column({ name: 'factory_address', type: 'text', nullable: true })
  factoryAddress: string | null;

  @Column({ name: 'factory_capacity', type: 'integer', nullable: true })
  factoryCapacity: number | null;

  @Column({ name: 'factory_hours', type: 'varchar', length: 120, nullable: true })
  factoryHours: string | null;

  @Column({ name: 'expiry_warn_days', type: 'integer' })
  expiryWarnDays: number;

  @Column({ name: 'low_stock_mode', type: 'varchar', length: 24 })
  lowStockMode: string;

  @Column({ name: 'default_location_id', type: 'varchar', length: 64, nullable: true })
  defaultLocationId: string | null;

  @Column({ name: 'week_start', type: 'varchar', length: 12 })
  weekStart: string;

  @Column({
    name: 'revenue_goal',
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  revenueGoal: number;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
