import 'dotenv/config';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { databaseConnection } from '../src/config/database-connection';
import {
  InventoryItemType,
  InventoryMovement,
  MovementType,
} from '../src/modules/inventory/inventory-movement.entity';
import {
  InsufficientStockException,
  InventoryService,
  ledgerLockKey,
} from '../src/modules/inventory/inventory.service';

/**
 * Real Postgres, not a simulation. Runs against TEST_DB_NAME (default
 * seentair_test), created and migrated on first use so the dev ledger is never
 * written to. Needs discrete DB_* variables: a DATABASE_URL names one fixed
 * database. Run with `npm run test:e2e` from services/api.
 */
const TEST_DB = process.env.TEST_DB_NAME ?? 'seentair_test';
if (!/^[a-z_][a-z0-9_]*$/.test(TEST_DB)) {
  throw new Error(`TEST_DB_NAME must be a plain lowercase identifier, got '${TEST_DB}'`);
}
const VARIANT = InventoryItemType.VARIANT;

async function ensureTestDatabase(): Promise<void> {
  const base = databaseConnection();
  if (base.url) throw new Error('The ledger e2e needs discrete DB_* variables, not DATABASE_URL');
  // Maintenance connection to the server's default database, to create ours.
  const admin = new DataSource({ type: 'postgres', ...base, database: 'postgres' });
  await admin.initialize();
  try {
    const exists: unknown[] = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      TEST_DB,
    ]);
    if (exists.length === 0) await admin.query(`CREATE DATABASE "${TEST_DB}"`);
  } finally {
    await admin.destroy();
  }
}

describe('inventory ledger — per-item write serialisation (real Postgres)', () => {
  let ds: DataSource;
  let inventory: InventoryService;

  const movement = (itemId: string, movementType: MovementType, quantityDelta: number) => ({
    itemType: VARIANT,
    itemId,
    movementType,
    quantityDelta,
    actorId: null,
  });
  const sale = (itemId: string, units: number) => movement(itemId, MovementType.SALE, -units);
  const stock = (itemId: string, units: number) =>
    ds.transaction((m) => inventory.record(movement(itemId, MovementType.PRODUCTION, units), m));
  const quantity = (itemId: string) => inventory.currentQuantity(VARIANT, itemId);
  /**
   * Advisory locks held on one item's key by any session. pg_locks shows a
   * 64-bit key as classid (high 32 bits) and objid (low 32 bits), objsubid 1.
   */
  const advisoryLocksHeld = async (itemId: string): Promise<number> => {
    const key = BigInt.asUintN(64, ledgerLockKey(VARIANT, itemId));
    const rows: Array<{ n: number }> = await ds.query(
      `SELECT count(*)::int AS n FROM pg_locks
        WHERE locktype = 'advisory' AND classid = $1 AND objid = $2 AND objsubid = 1`,
      [Number(key >> 32n), Number(key & 0xffffffffn)],
    );
    return rows[0].n;
  };

  beforeAll(async () => {
    await ensureTestDatabase();
    const base = databaseConnection();
    ds = new DataSource({
      type: 'postgres',
      ...base,
      database: TEST_DB,
      entities: [`${__dirname}/../src/**/*.entity.ts`],
      migrations: [`${__dirname}/../src/database/migrations/*.ts`],
      synchronize: false,
    });
    await ds.initialize();
    await ds.runMigrations();
    inventory = new InventoryService(ds.getRepository(InventoryMovement), ds);
  });

  afterAll(async () => {
    await ds?.destroy();
  });

  /**
   * A transaction on a connection that is already open, so two of them are
   * genuinely in flight together and interleave statement by statement. Going
   * through dataSource.transaction() would open the second connection lazily
   * and the first would usually have committed before the race even began.
   */
  const inFlight = async (work: (m: EntityManager) => Promise<unknown>) => {
    const runner = ds.createQueryRunner();
    await runner.connect();
    return async () => {
      await runner.startTransaction();
      try {
        const result = await work(runner.manager);
        await runner.commitTransaction();
        return result;
      } catch (err) {
        await runner.rollbackTransaction();
        throw err;
      } finally {
        await runner.release();
      }
    };
  };

  it('two concurrent sales of the last unit: exactly one succeeds and stock never goes below zero', async () => {
    const v = randomUUID();
    await stock(v, 1);

    const [first, second] = await Promise.all([
      inFlight((m) => inventory.record(sale(v, 1), m)),
      inFlight((m) => inventory.record(sale(v, 1), m)),
    ]);
    const results = await Promise.allSettled([first(), second()]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(InsufficientStockException);
    expect(await quantity(v)).toBe(0);
  });

  it('two multi-line writers covering the same items in opposite order complete without deadlock', async () => {
    const x = randomUUID();
    const y = randomUUID();
    await stock(x, 5);
    await stock(y, 5);

    // The discipline every multi-item writer follows: lock all lines up front
    // (lockItems sorts), then write them in whatever order the order lists them.
    const writer = (first: string, second: string) =>
      ds.transaction(async (m) => {
        await inventory.lockItems(m, [
          { itemType: VARIANT, itemId: first },
          { itemType: VARIANT, itemId: second },
        ]);
        await inventory.record(sale(first, 1), m);
        // The other writer is waiting inside lockItems, holding nothing yet — whichever
        // took both keys first runs to completion, then the other takes both and runs.
        await new Promise((r) => setTimeout(r, 50));
        await inventory.record(sale(second, 1), m);
      });

    await expect(Promise.all([writer(x, y), writer(y, x)])).resolves.toBeDefined();
    expect(await quantity(x)).toBe(3);
    expect(await quantity(y)).toBe(3);
  });

  it('control: the same pattern without the up-front sorted lock deadlocks in Postgres', async () => {
    const x = randomUUID();
    const y = randomUUID();
    await stock(x, 5);
    await stock(y, 5);

    const writer = (first: string, second: string) =>
      ds.transaction(async (m) => {
        await inventory.record(sale(first, 1), m); // takes only its own item's lock
        await new Promise((r) => setTimeout(r, 50));
        await inventory.record(sale(second, 1), m); // now waits on the lock the other writer holds
      });

    const results = await Promise.allSettled([writer(x, y), writer(y, x)]);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    const cause = rejected[0].reason as { driverError?: { code?: string } };
    expect(cause.driverError?.code).toBe('40P01'); // deadlock_detected — the victim rolled back
  });

  it('a rolled-back transaction leaves no lock held', async () => {
    const v = randomUUID();
    await expect(
      ds.transaction(async (m) => {
        await inventory.record(movement(v, MovementType.PRODUCTION, 1), m);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await advisoryLocksHeld(v)).toBe(0);
    const started = Date.now();
    await stock(v, 1); // must not block behind the aborted transaction's lock
    expect(Date.now() - started).toBeLessThan(1000);
    expect(await quantity(v)).toBe(1); // the rolled-back +1 never landed
  });

  it('recordStandalone opens its own transaction, and the lock is refused on a bare manager', async () => {
    const v = randomUUID();
    await inventory.recordStandalone(movement(v, MovementType.PRODUCTION, 2));
    await expect(inventory.recordStandalone(sale(v, 3))).rejects.toBeInstanceOf(
      InsufficientStockException,
    );
    expect(await quantity(v)).toBe(2);
    expect(await advisoryLocksHeld(v)).toBe(0);

    await expect(
      inventory.lockItems(ds.manager, [{ itemType: VARIANT, itemId: v }]),
    ).rejects.toThrow('active transaction');
  });
});
