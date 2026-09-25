import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
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
    @InjectDataSource() private readonly dataSource: DataSource,
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

  /**
   * Per-item ledger digest: the derived quantity plus the hash-chain head for
   * that item. The admin shows this as a verifiable "ledger badge".
   */
  async digest(
    itemType: InventoryItemType,
    itemId: string,
  ): Promise<{
    itemType: InventoryItemType;
    itemId: string;
    currentQuantity: number;
    entryCount: number;
    firstTimestamp: Date | null;
    lastTimestamp: Date | null;
    ledgerHead: string | null;
  }> {
    const [currentQuantity, entryCount, head] = await Promise.all([
      this.currentQuantity(itemType, itemId),
      this.movementRepo.count({ where: { itemType, itemId } }),
      this.movementRepo
        .createQueryBuilder('m')
        .select('m.entry_hash', 'ledger_head')
        .addSelect('m.timestamp', 'last_timestamp')
        .addSelect('(SELECT MIN(m2.timestamp) FROM inventory_movements m2 WHERE m2.item_type = :itemType AND m2.item_id = :itemId)', 'first_timestamp')
        .where('m.item_type = :itemType AND m.item_id = :itemId', { itemType, itemId })
        .orderBy('m.timestamp', 'DESC')
        .addOrderBy('m.id', 'DESC')
        .limit(1)
        .getRawOne<{ ledger_head: string; last_timestamp: Date; first_timestamp: Date }>(),
    ]);
    return {
      itemType,
      itemId,
      currentQuantity,
      entryCount,
      firstTimestamp: head?.first_timestamp ?? null,
      lastTimestamp: head?.last_timestamp ?? null,
      ledgerHead: head?.ledger_head ?? null,
    };
  }

  /** Full-ledger hash-chain integrity check (same expression as the insert trigger). */
  async verify(): Promise<{
    total: number;
    valid: number;
    broken: number;
    headHash: string | null;
  }> {
    const rows: Array<{
      total: string;
      valid: string;
      broken: string;
      head_hash: string | null;
    }> = await this.dataSource.query(
      `WITH linked AS (
         SELECT id,
                "timestamp",
                prev_hash,
                entry_hash,
                seentair_chain_hash(
                  id,
                  prev_hash,
                  item_type::text,
                  NULL,
                  jsonb_build_object(
                    'itemId', item_id::text,
                    'movementType', movement_type::text,
                    'quantityDelta', quantity_delta,
                    'actorId', actor_id::text,
                    'referenceId', reference_id),
                  "timestamp") AS expected_hash,
                (prev_hash IS NOT NULL AND NOT EXISTS (
                  SELECT 1 FROM inventory_movements p WHERE p.entry_hash = inventory_movements.prev_hash
                )) AS dangling
         FROM inventory_movements
       )
       SELECT count(*)::text AS total,
              count(*) FILTER (WHERE entry_hash = expected_hash AND NOT dangling)::text AS valid,
              count(*) FILTER (WHERE entry_hash IS DISTINCT FROM expected_hash OR dangling)::text AS broken,
              (SELECT entry_hash FROM inventory_movements ORDER BY "timestamp" DESC, id DESC LIMIT 1) AS head_hash
       FROM linked`,
    );
    const row = rows[0];
    return {
      total: parseInt(row?.total ?? '0', 10),
      valid: parseInt(row?.valid ?? '0', 10),
      broken: parseInt(row?.broken ?? '0', 10),
      headHash: row?.head_hash ?? null,
    };
  }
}
