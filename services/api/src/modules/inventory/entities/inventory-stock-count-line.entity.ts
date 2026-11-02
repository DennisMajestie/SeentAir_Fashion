import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { InventoryItemType } from '../inventory-movement.entity';
import { InventoryStockCount } from './inventory-stock-count.entity';

@Entity('inventory_stock_count_lines')
@Index('IDX_inventory_stock_count_lines_count', ['stockCount'])
export class InventoryStockCountLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => InventoryStockCount, (count) => count.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stock_count_id' })
  stockCount: InventoryStockCount;

  @Column({ name: 'item_type', type: 'enum', enum: InventoryItemType })
  itemType: InventoryItemType;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({ name: 'system_quantity', type: 'integer' })
  systemQuantity: number;

  @Column({ name: 'counted_quantity', type: 'integer' })
  countedQuantity: number;

  @Column({ name: 'adjustment_quantity', type: 'integer' })
  adjustmentQuantity: number;

  @Column({ name: 'approval_request_id', type: 'uuid', nullable: true })
  approvalRequestId: string | null;
}
