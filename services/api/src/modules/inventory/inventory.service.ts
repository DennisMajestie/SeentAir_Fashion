import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  InventoryItemType,
  InventoryMovement,
  MovementType,
} from './inventory-movement.entity';

export interface RecordMovementInput {
  itemType: InventoryItemType;
  itemId: string;
  movementType: MovementType;
  quantityDelta: number;
  actorId: string | null;
  referenceId?: string | null;
}

/**
 * The ONLY write path to stock. Feature modules (materials, sales, returns,
 * production) call record() — never a direct quantity write anywhere.
 * A movement that would take stock below zero is rejected.
 */
@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryMovement)
    private readonly movementRepo: Repository<InventoryMovement>,
  ) {}

  async record(input: RecordMovementInput, manager?: EntityManager): Promise<InventoryMovement> {
    if (!Number.isInteger(input.quantityDelta) || input.quantityDelta === 0) {
      throw new BadRequestException('quantityDelta must be a non-zero integer');
    }
    if (input.quantityDelta < 0) {
      const current = await this.currentQuantity(input.itemType, input.itemId, manager);
      if (current + input.quantityDelta < 0) {
        throw new BadRequestException(
          `Insufficient stock: current quantity is ${current}, movement of ${input.quantityDelta} refused`,
        );
      }
    }
    const repo = manager ? manager.getRepository(InventoryMovement) : this.movementRepo;
    const movement = repo.create({
      itemType: input.itemType,
      itemId: input.itemId,
      movementType: input.movementType,
      quantityDelta: input.quantityDelta,
      actorId: input.actorId,
      referenceId: input.referenceId ?? null,
    });
    return repo.save(movement);
  }

  /** Derived, never stored: SUM of all movement deltas for the item. */
  async currentQuantity(
    itemType: InventoryItemType,
    itemId: string,
    manager?: EntityManager,
  ): Promise<number> {
    const repo = manager ? manager.getRepository(InventoryMovement) : this.movementRepo;
    const result: { sum: string | null } | undefined = await repo
      .createQueryBuilder('m')
      .select('SUM(m.quantity_delta)', 'sum')
      .where('m.item_type = :itemType AND m.item_id = :itemId', { itemType, itemId })
      .getRawOne();
    return parseInt(result?.sum ?? '0', 10) || 0;
  }

  async movements(
    itemType: InventoryItemType,
    itemId: string,
    page = 1,
    limit = 50,
  ): Promise<{ data: InventoryMovement[]; total: number; currentQuantity: number }> {
    const [data, total] = await this.movementRepo.findAndCount({
      where: { itemType, itemId },
      order: { timestamp: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const currentQuantity = await this.currentQuantity(itemType, itemId);
    return { data, total, currentQuantity };
  }

  /** Per-item current quantities plus in/out totals by movement type. */
  async summary(): Promise<
    Array<{
      itemType: string;
      itemId: string;
      currentQuantity: number;
      byMovementType: Record<string, number>;
    }>
  > {
    const rows: Array<{
      item_type: string;
      item_id: string;
      movement_type: string;
      total: string;
    }> = await this.movementRepo
      .createQueryBuilder('m')
      .select('m.item_type', 'item_type')
      .addSelect('m.item_id', 'item_id')
      .addSelect('m.movement_type', 'movement_type')
      .addSelect('SUM(m.quantity_delta)', 'total')
      .groupBy('m.item_type')
      .addGroupBy('m.item_id')
      .addGroupBy('m.movement_type')
      .getRawMany();

    const byItem = new Map<
      string,
      { itemType: string; itemId: string; currentQuantity: number; byMovementType: Record<string, number> }
    >();
    for (const row of rows) {
      const key = `${row.item_type}:${row.item_id}`;
      const entry =
        byItem.get(key) ??
        { itemType: row.item_type, itemId: row.item_id, currentQuantity: 0, byMovementType: {} };
      const total = parseInt(row.total, 10) || 0;
      entry.byMovementType[row.movement_type] = total;
      entry.currentQuantity += total;
      byItem.set(key, entry);
    }
    return [...byItem.values()];
  }
}
