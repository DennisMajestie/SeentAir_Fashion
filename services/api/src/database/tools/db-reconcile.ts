import { createHash } from 'crypto';
import type { QueryRunner } from 'typeorm';
import { AppDataSource } from '../data-source';

interface CountRow {
  rows: number;
}

interface MoneyGroupRow {
  status: string;
  count: number;
  amountTotal: string;
}

interface ChannelGroupRow {
  channel: string;
  count: number;
  amountTotal: string;
}

interface OrderItemTotalsRow {
  count: number;
  totalValue: string;
}

interface InventoryRow {
  variantId: string;
  onHand: number;
}

interface ForeignKeyRow {
  constraint: string;
  childTable: string;
  parentTable: string;
  childColumns: string[];
  parentColumns: string[];
}

interface OrphanRow extends ForeignKeyRow {
  orphanCount: number;
}

interface DuplicateKeyRow {
  key: string;
  count: number;
}

interface CheckoutShippingRow {
  withSnapshot: number;
  withoutSnapshot: number;
}

interface CouponRedemptionRow {
  status: string;
  count: number;
  discountTotal: string;
}

export interface ReconcileReport {
  tool: 'db:reconcile';
  version: 1;
  tables: Array<{ table: string; rows: number }>;
  orders: {
    byStatus: MoneyGroupRow[];
    byChannel: ChannelGroupRow[];
  };
  payments: {
    byStatus: MoneyGroupRow[];
  };
  orderItems: OrderItemTotalsRow;
  inventory: {
    totalOnHand: number;
    variantsWithNegativeBalance: number;
    byVariant: InventoryRow[];
  };
  orphans: OrphanRow[];
  duplicates: {
    userEmails: {
      duplicateGroups: number;
      affectedRows: number;
      groups: Array<{ keyHash: string; count: number }>;
    };
    orderNumbers: {
      duplicateGroups: number;
      affectedRows: number;
      groups: Array<{ orderNumber: string; count: number }>;
    };
    paymentReferences: {
      duplicateGroups: number;
      affectedRows: number;
      groups: Array<{ keyHash: string; count: number }>;
    };
  };
  checkoutShipping: CheckoutShippingRow;
  couponRedemptions: {
    byStatus: CouponRedemptionRow[];
  };
}

export function assertReadOnlyAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === 'production' && env.ALLOW_PROD_READONLY !== 'true') {
    throw new Error(
      'db:reconcile is read-only: refusing NODE_ENV=production without ALLOW_PROD_READONLY=true.',
    );
  }
}

export function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export function hashKey(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

async function queryRows<T>(runner: QueryRunner, sql: string): Promise<T[]> {
  return (await runner.query(sql)) as unknown as T[];
}

async function tableCounts(
  runner: QueryRunner,
): Promise<Array<{ table: string; rows: number }>> {
  const tables = await queryRows<{ table: string }>(
    runner,
    `SELECT table_name AS "table"
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
  );

  const counts: Array<{ table: string; rows: number }> = [];
  for (const table of tables) {
    const [count] = await queryRows<CountRow>(
      runner,
      `SELECT count(*)::int AS "rows" FROM ${quoteIdent(table.table)}`,
    );
    counts.push({ table: table.table, rows: count.rows });
  }
  return counts;
}

async function orphanChecks(runner: QueryRunner): Promise<OrphanRow[]> {
  const foreignKeys = await queryRows<ForeignKeyRow>(
    runner,
    `SELECT con.conname AS "constraint",
            child.relname AS "childTable",
            parent.relname AS "parentTable",
            array_agg(child_col.attname::text ORDER BY ck.ord) AS "childColumns",
            array_agg(parent_col.attname::text ORDER BY ck.ord) AS "parentColumns"
       FROM pg_constraint con
       JOIN pg_class child ON child.oid = con.conrelid
       JOIN pg_class parent ON parent.oid = con.confrelid
       JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
       JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
       JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS ck(attnum, ord) ON TRUE
       JOIN LATERAL unnest(con.confkey) WITH ORDINALITY AS pk(attnum, ord) ON pk.ord = ck.ord
       JOIN pg_attribute child_col
         ON child_col.attrelid = con.conrelid AND child_col.attnum = ck.attnum
       JOIN pg_attribute parent_col
         ON parent_col.attrelid = con.confrelid AND parent_col.attnum = pk.attnum
      WHERE con.contype = 'f'
        AND child_ns.nspname = 'public'
        AND parent_ns.nspname = 'public'
      GROUP BY con.conname, child.relname, parent.relname
      ORDER BY child.relname, con.conname`,
  );

  const orphans: OrphanRow[] = [];
  for (const foreignKey of foreignKeys) {
    const childColumns = foreignKey.childColumns.map(quoteIdent);
    const parentColumns = foreignKey.parentColumns.map(quoteIdent);
    const notNull = childColumns.map((column) => `c.${column} IS NOT NULL`).join(' AND ');
    const join = childColumns
      .map((column, index) => `p.${parentColumns[index]} = c.${column}`)
      .join(' AND ');

    const [row] = await queryRows<{ orphanCount: number }>(
      runner,
      `SELECT count(*)::int AS "orphanCount"
         FROM ${quoteIdent(foreignKey.childTable)} c
        WHERE ${notNull}
          AND NOT EXISTS (
            SELECT 1 FROM ${quoteIdent(foreignKey.parentTable)} p WHERE ${join}
          )`,
    );
    orphans.push({ ...foreignKey, orphanCount: row.orphanCount });
  }
  return orphans;
}

export async function buildReconcileReport(runner: QueryRunner): Promise<ReconcileReport> {
  const tables = await tableCounts(runner);

  const ordersByStatus = await queryRows<MoneyGroupRow>(
    runner,
    `SELECT status::text AS "status",
            count(*)::int AS "count",
            COALESCE(SUM(total_amount), 0)::text AS "amountTotal"
       FROM "orders"
      GROUP BY status
      ORDER BY status`,
  );

  const ordersByChannel = await queryRows<ChannelGroupRow>(
    runner,
    `SELECT channel::text AS "channel",
            count(*)::int AS "count",
            COALESCE(SUM(total_amount), 0)::text AS "amountTotal"
       FROM "orders"
      GROUP BY channel
      ORDER BY channel`,
  );

  const paymentsByStatus = await queryRows<MoneyGroupRow>(
    runner,
    `SELECT status::text AS "status",
            count(*)::int AS "count",
            COALESCE(SUM(amount), 0)::text AS "amountTotal"
       FROM "payments"
      GROUP BY status
      ORDER BY status`,
  );

  const [orderItems] = await queryRows<OrderItemTotalsRow>(
    runner,
    `SELECT count(*)::int AS "count",
            COALESCE(SUM(quantity * unit_price), 0)::text AS "totalValue"
       FROM "order_items"`,
  );

  const inventoryByVariant = await queryRows<InventoryRow>(
    runner,
    `SELECT v."id" AS "variantId",
            COALESCE(SUM(m."quantity_delta"), 0)::int AS "onHand"
       FROM "product_variants" v
       LEFT JOIN "inventory_movements" m
         ON m."item_type" = 'variant' AND m."item_id" = v."id"
      GROUP BY v."id"
      ORDER BY v."id"`,
  );

  const inventory = {
    totalOnHand: inventoryByVariant.reduce((sum, row) => sum + row.onHand, 0),
    variantsWithNegativeBalance: inventoryByVariant.filter((row) => row.onHand < 0).length,
    byVariant: inventoryByVariant,
  };

  const orphans = await orphanChecks(runner);

  const userEmailRows = await queryRows<DuplicateKeyRow>(
    runner,
    `SELECT lower(btrim(email)) AS "key", count(*)::int AS "count"
       FROM "users"
      GROUP BY lower(btrim(email))
     HAVING count(*) > 1
      ORDER BY "key"`,
  );

  const orderNumberRows = await queryRows<DuplicateKeyRow>(
    runner,
    `SELECT order_number::text AS "key", count(*)::int AS "count"
       FROM "orders"
      GROUP BY order_number
     HAVING count(*) > 1
      ORDER BY "key"`,
  );

  const paymentReferenceRows = await queryRows<DuplicateKeyRow>(
    runner,
    `SELECT reference AS "key", count(*)::int AS "count"
       FROM "payments"
      WHERE reference IS NOT NULL
      GROUP BY reference
     HAVING count(*) > 1
      ORDER BY "key"`,
  );

  const [checkoutShipping] = await queryRows<CheckoutShippingRow>(
    runner,
    `SELECT count(*) FILTER (
              WHERE EXISTS (
                SELECT 1 FROM "order_checkout_shipping" s WHERE s."order_id" = o."id"
              )
            )::int AS "withSnapshot",
            count(*) FILTER (
              WHERE NOT EXISTS (
                SELECT 1 FROM "order_checkout_shipping" s WHERE s."order_id" = o."id"
              )
            )::int AS "withoutSnapshot"
       FROM "orders" o`,
  );

  const couponRedemptions = await queryRows<CouponRedemptionRow>(
    runner,
    `SELECT status::text AS "status",
            count(*)::int AS "count",
            COALESCE(SUM(discount_minor), 0)::text AS "discountTotal"
       FROM "coupon_redemption"
      GROUP BY status
      ORDER BY status`,
  );

  return {
    tool: 'db:reconcile',
    version: 1,
    tables,
    orders: {
      byStatus: ordersByStatus,
      byChannel: ordersByChannel,
    },
    payments: {
      byStatus: paymentsByStatus,
    },
    orderItems,
    inventory,
    orphans,
    duplicates: {
      userEmails: {
        duplicateGroups: userEmailRows.length,
        affectedRows: userEmailRows.reduce((sum, row) => sum + row.count, 0),
        groups: userEmailRows.map((row) => ({ keyHash: hashKey(row.key), count: row.count })),
      },
      orderNumbers: {
        duplicateGroups: orderNumberRows.length,
        affectedRows: orderNumberRows.reduce((sum, row) => sum + row.count, 0),
        groups: orderNumberRows.map((row) => ({ orderNumber: row.key, count: row.count })),
      },
      paymentReferences: {
        duplicateGroups: paymentReferenceRows.length,
        affectedRows: paymentReferenceRows.reduce((sum, row) => sum + row.count, 0),
        groups: paymentReferenceRows.map((row) => ({
          keyHash: hashKey(row.key),
          count: row.count,
        })),
      },
    },
    checkoutShipping,
    couponRedemptions: {
      byStatus: couponRedemptions,
    },
  };
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[redacted-connection-string]')
    .replace(/(password|pwd)=[^\s&]+/gi, '$1=[redacted]');
}

async function main(): Promise<void> {
  assertReadOnlyAllowed();
  await AppDataSource.initialize();

  try {
    const runner = AppDataSource.createQueryRunner();
    try {
      await runner.connect();
      await runner.query('SET default_transaction_read_only = on');
      await runner.query("SET statement_timeout = '30s'");
      const report = await buildReconcileReport(runner);
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } finally {
      await runner.release();
    }
  } finally {
    await AppDataSource.destroy();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(`db:reconcile failed: ${safeErrorMessage(error)}\n`);
    process.exitCode = 1;
  });
}
