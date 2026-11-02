import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { InventoryStockCountLine } from './inventory-stock-count-line.entity';

@Entity('inventory_stock_counts')
@Index('IDX_inventory_stock_counts_created_at', ['createdAt'])
export class InventoryStockCount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => InventoryStockCountLine, (line) => line.stockCount, { cascade: ['insert'] })
  lines: InventoryStockCountLine[];
}
