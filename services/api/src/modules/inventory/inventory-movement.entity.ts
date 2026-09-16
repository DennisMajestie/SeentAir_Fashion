import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum InventoryItemType {
  VARIANT = 'variant',
  MATERIAL = 'material',
}

/** Movement types from docs/project/08-Initial-Data-Model.md. */
export enum MovementType {
  PURCHASE = 'purchase',
  PRODUCTION = 'production',
  SALE = 'sale',
  RETURN = 'return',
  DAMAGE = 'damage',
  DISPATCH = 'dispatch',
  ADJUSTMENT = 'adjustment',
}

/**
 * THE source of truth for stock (architectural principle #2).
 * Append-only: no update or delete path exists anywhere in the API.
 * Current quantities are always derived as SUM(quantity_delta) —
 * `current_quantity` fields elsewhere are caches, never authoritative.
 */
@Entity('inventory_movements')
@Index(['itemType', 'itemId'])
export class InventoryMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'item_type', type: 'enum', enum: InventoryItemType })
  itemType: InventoryItemType;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Index()
  @Column({ name: 'movement_type', type: 'enum', enum: MovementType })
  movementType: MovementType;

  /** Positive = stock in, negative = stock out. Never zero. */
  @Column({ name: 'quantity_delta', type: 'integer' })
  quantityDelta: number;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  /** Link to the originating record (order id, purchase id, batch id, …). */
  @Column({ name: 'reference_id', type: 'varchar', nullable: true })
  referenceId: string | null;

  @Index()
  @CreateDateColumn({ name: 'timestamp' })
  timestamp: Date;
}
