import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * NOTE: current quantity is intentionally NOT a column — it is always
 * derived from the inventory movement ledger (architectural principle #2).
 * No supplier entity exists: supplier management is explicitly descoped
 * (appendix 13) — purchases carry an optional free-text note instead.
 */
@Entity('raw_materials')
export class RawMaterial {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  /** Unit of measure: yards, kg, pieces, rolls, … */
  @Column()
  unit: string;

  /** fabrics | trims_hardware | thread | packaging | printing | labels | other */
  @Column({ type: 'varchar', nullable: true })
  category: string | null;

  /** Warehouse location, e.g. "C3-R1" (bay-rack map). */
  @Column({ name: 'storage_location', type: 'varchar', nullable: true })
  storageLocation: string | null;

  @Column({ name: 'reorder_threshold', type: 'integer', default: 0 })
  reorderThreshold: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
