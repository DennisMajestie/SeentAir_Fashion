import { AppDataSource } from '../data-source';
import {
  assertReadOnlyAllowed,
  buildReconcileReport,
  hashKey,
  quoteIdent,
} from './db-reconcile';

describe('db:reconcile production guard', () => {
  it('refuses production without ALLOW_PROD_READONLY=true', () => {
    expect(() => assertReadOnlyAllowed({ NODE_ENV: 'production' })).toThrow(
      /ALLOW_PROD_READONLY/,
    );
  });

  it('allows production when ALLOW_PROD_READONLY=true', () => {
    expect(() =>
      assertReadOnlyAllowed({
        NODE_ENV: 'production',
        ALLOW_PROD_READONLY: 'true',
      }),
    ).not.toThrow();
  });

  it('allows non-production without the override', () => {
    expect(() => assertReadOnlyAllowed({ NODE_ENV: 'development' })).not.toThrow();
  });
});

describe('db:reconcile helpers', () => {
  it('quotes identifiers and escapes embedded double quotes', () => {
    expect(quoteIdent('orders')).toBe('"orders"');
    expect(quoteIdent('a"b')).toBe('"a""b"');
  });

  it('hashes duplicate keys without exposing the raw value', () => {
    const value = 'person@example.com';
    expect(hashKey(value)).toBe(hashKey(value));
    expect(hashKey(value)).not.toContain(value);
    expect(hashKey(value)).toHaveLength(16);
  });
});

const describeWithDatabase =
  process.env.DB_RECONCILE_TEST === 'true' ? describe : describe.skip;

describeWithDatabase('db:reconcile against a disposable database', () => {
  jest.setTimeout(60_000);

  beforeAll(async () => {
    assertReadOnlyAllowed();
    await AppDataSource.initialize();
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  it('produces a stable, sorted, read-only snapshot', async () => {
    const runner = AppDataSource.createQueryRunner();
    await runner.connect();
    try {
      await runner.query('SET default_transaction_read_only = on');
      const first = await buildReconcileReport(runner);
      const second = await buildReconcileReport(runner);

      expect(first.tables.some((table) => table.table === 'orders')).toBe(true);
      expect(first.tables.map((table) => table.table)).toEqual(
        [...first.tables.map((table) => table.table)].sort(),
      );
      expect(first.orphans.map((orphan) => `${orphan.childTable}:${orphan.constraint}`)).toEqual(
        [...first.orphans.map((orphan) => `${orphan.childTable}:${orphan.constraint}`)].sort(),
      );
      expect(first.orphans.every((orphan) => orphan.orphanCount >= 0)).toBe(true);
      expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    } finally {
      await runner.release();
    }
  });
});
