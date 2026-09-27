import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { InventoryItemType, InventoryMovement, MovementType } from './inventory-movement.entity';

export interface RecordMovementInput {
  itemType: InventoryItemType;
  itemId: string;
  movementType: MovementType;
  quantityDelta: number;
  actorId: string | null;
  referenceId?: string | null;
}

/**
 * Thrown by the ledger guard only. Still a 400 with the same message; the
 * distinct class lets callers that must commit regardless (a paid order)
 * catch exactly this case and nothing else.
 */
export class InsufficientStockException extends BadRequestException {}

export interface LedgerItem {
  itemType: InventoryItemType;
  itemId: string;
}

/**
 * 64-bit advisory-lock key for one ledger item: the first 8 bytes of
 * SHA-256("<itemType>:<itemId>") as a signed bigint. Stable across processes
 * and Postgres versions; the type prefix keeps a material and a variant that
 * share an id on different keys.
 */
export function ledgerLockKey(itemType: InventoryItemType, itemId: string): bigint {
  return createHash('sha256').update(`${itemType}:${itemId}`).digest().readBigInt64BE(0);
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

  /**
   * Write one movement inside the caller's transaction. The manager is
   * required on purpose: a call from inside a transaction that forgot to pass
   * it would take the item lock on a second connection and wait on itself for
   * ever — a hang Postgres cannot detect. Callers with no transaction of their
   * own use recordStandalone().
   */
  async record(input: RecordMovementInput, manager: EntityManager): Promise<InventoryMovement> {
    if (!Number.isInteger(input.quantityDelta) || input.quantityDelta === 0) {
      throw new BadRequestException('quantityDelta must be a non-zero integer');
    }
    // Serialise the read-then-insert below per item; released with the transaction.
    await this.lockItems(manager, [input]);
    if (input.quantityDelta < 0) {
      const current = await this.currentQuantity(input.itemType, input.itemId, manager);
      if (current + input.quantityDelta < 0) {
        throw new InsufficientStockException(
          `Insufficient stock: current quantity is ${current}, movement of ${input.quantityDelta} refused`,
        );
      }
    }
    const repo = manager.getRepository(InventoryMovement);
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

  /** One movement in a transaction of its own — for callers that are not already in one. */
  async recordStandalone(input: RecordMovementInput): Promise<InventoryMovement> {
    return this.dataSource.transaction((tx) => this.record(input, tx));
  }

  /**
   * Serialise ledger writes per item for the rest of the caller's transaction.
   * pg_advisory_xact_lock is released with the transaction — commit or rollback
   * alike — so there is no unlock call and nothing can leak. Keys are taken in
   * sorted order, so two writers covering the same items can never deadlock by
   * locking the same pair in opposite order: a caller that writes several items
   * in one transaction calls this once, up front, before its first record().
   *
   * Requires an active transaction. On a plain connection the lock would be
   * released the moment the statement ended and protect nothing, so that is an
   * error rather than a silent no-op.
   */
  async lockItems(manager: EntityManager, items: LedgerItem[]): Promise<void> {
    if (!manager.queryRunner?.isTransactionActive) {
      throw new Error(
        'InventoryService.lockItems needs an EntityManager inside an active transaction',
      );
    }
    const keys = [...new Set(items.map((i) => ledgerLockKey(i.itemType, i.itemId)))].sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    if (keys.length === 0) return;
    // One round-trip: unnest yields the array in order, so the locks are taken sorted.
    await manager.query('SELECT pg_advisory_xact_lock(k) FROM unnest($1::bigint[]) AS k', [
      keys.map((k) => k.toString()),
    ]);
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
      {
        itemType: string;
        itemId: string;
        currentQuantity: number;
        byMovementType: Record<string, number>;
      }
    >();
    for (const row of rows) {
      const key = `${row.item_type}:${row.item_id}`;
      const entry = byItem.get(key) ?? {
        itemType: row.item_type,
        itemId: row.item_id,
        currentQuantity: 0,
        byMovementType: {},
      };
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
        .addSelect(
          '(SELECT MIN(m2.timestamp) FROM inventory_movements m2 WHERE m2.item_type = :itemType AND m2.item_id = :itemId)',
          'first_timestamp',
        )
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
