import type { QueryRunner } from 'typeorm';
import { matchState } from '../../modules/checkout-shipping/nigerian-states';
import {
  assertReadOnlyAllowed,
  queryRows,
  runReadOnly,
  safeErrorMessage,
} from './db-tooling';

const TEST_EMAIL_DOMAIN = '@seentair.test';

const PRIVILEGED_ROLES = [
  'business_owner_admin',
  'management',
  'finance_accounting',
  'partner_investor',
];

interface TestUserRow {
  role: string;
  status: string;
  count: number;
}

interface PrivilegedUserRow {
  role: string;
  status: string;
  emailVerified: boolean;
  count: number;
}

interface CategoryVariantRow {
  normalized: string;
  productCount: number;
  spellings: string[];
}

interface StateCountRow {
  state: string;
  count: number;
}

interface CollisionRow {
  total: number;
  unclaimed: number;
}

interface ImageRow {
  productsWithoutPrimary: number;
  variantsWithoutImage: number;
  productsWithoutAnyImage: number;
}

interface StockMovementRow {
  variantsWithoutMovements: number;
}

interface StaleOrderRow {
  count: number;
}

interface RefreshTokenRow {
  total: number;
  revoked: number;
  expired: number;
  revokedAndExpired: number;
}

export interface ShippingStateSummary {
  knownOrderCount: number;
  unknownOrderCount: number;
  distinctUnknown: number;
  unknown: StateCountRow[];
}

export interface HygieneReport {
  tool: 'db:hygiene';
  version: 1;
  testUsers: TestUserRow[];
  privilegedUsers: {
    roles: string[];
    byRole: PrivilegedUserRow[];
  };
  categoryVariants: CategoryVariantRow[];
  shippingStates: ShippingStateSummary;
  guestEmailCollisions: CollisionRow;
  images: ImageRow;
  stockMovements: StockMovementRow;
  staleAwaitingPayment: {
    thresholdHours: number;
    count: number;
  };
  refreshTokens: RefreshTokenRow;
}

export function summarizeShippingStates(rows: StateCountRow[]): ShippingStateSummary {
  let knownOrderCount = 0;
  const unknown: StateCountRow[] = [];

  for (const row of rows) {
    if (matchState(row.state)) {
      knownOrderCount += row.count;
    } else {
      unknown.push(row);
    }
  }

  return {
    knownOrderCount,
    unknownOrderCount: unknown.reduce((sum, row) => sum + row.count, 0),
    distinctUnknown: unknown.length,
    unknown,
  };
}

export async function buildHygieneReport(runner: QueryRunner): Promise<HygieneReport> {
  const testUsers = await queryRows<TestUserRow>(
    runner,
    `SELECT r.name::text AS "role",
            u.status::text AS "status",
            count(*)::int AS "count"
       FROM "users" u
       JOIN "roles" r ON r.id = u.role_id
      WHERE lower(btrim(u.email)) LIKE $1
      GROUP BY r.name, u.status
      ORDER BY r.name, u.status`,
    [`%${TEST_EMAIL_DOMAIN}`],
  );

  const allPrivilegedUsers = await queryRows<PrivilegedUserRow>(
    runner,
    `SELECT r.name::text AS "role",
            u.status::text AS "status",
            (u.email_verified_at IS NOT NULL) AS "emailVerified",
            count(*)::int AS "count"
       FROM "users" u
       JOIN "roles" r ON r.id = u.role_id
      GROUP BY r.name, u.status, (u.email_verified_at IS NOT NULL)
      ORDER BY r.name, u.status, "emailVerified" DESC`,
  );

  const privilegedUsers = allPrivilegedUsers.filter((row) =>
    PRIVILEGED_ROLES.includes(row.role),
  );

  const categoryVariants = await queryRows<CategoryVariantRow>(
    runner,
    `SELECT lower(btrim(regexp_replace(category, '[[:space:]]+', ' ', 'g'))) AS "normalized",
            count(*)::int AS "productCount",
            array_agg(DISTINCT category ORDER BY category) AS "spellings"
       FROM "products"
      WHERE category IS NOT NULL
        AND btrim(category) <> ''
      GROUP BY 1
     HAVING count(DISTINCT category) > 1
      ORDER BY 1`,
  );

  const stateRows = await queryRows<StateCountRow>(
    runner,
    `SELECT shipping_address->>'state' AS "state",
            count(*)::int AS "count"
       FROM "orders"
      WHERE shipping_address IS NOT NULL
        AND shipping_address->>'state' IS NOT NULL
      GROUP BY 1
      ORDER BY 1`,
  );
  const shippingStates = summarizeShippingStates(stateRows);

  const [guestEmailCollisions] = await queryRows<CollisionRow>(
    runner,
    `SELECT count(*)::int AS "total",
            count(*) FILTER (WHERE o.claimed_at IS NULL)::int AS "unclaimed"
       FROM "orders" o
      WHERE o.guest_email IS NOT NULL
        AND btrim(o.guest_email) <> ''
        AND EXISTS (
          SELECT 1
            FROM "users" u
           WHERE lower(btrim(u.email)) = lower(btrim(o.guest_email))
        )`,
  );

  const [images] = await queryRows<ImageRow>(
    runner,
    `SELECT
       (SELECT count(*)::int
          FROM "products"
         WHERE primary_image_url IS NULL OR btrim(primary_image_url) = '') AS "productsWithoutPrimary",
       (SELECT count(*)::int
          FROM "product_variants"
         WHERE image_url IS NULL OR btrim(image_url) = '') AS "variantsWithoutImage",
       (SELECT count(*)::int
          FROM "products" p
         WHERE (p.primary_image_url IS NULL OR btrim(p.primary_image_url) = '')
           AND NOT EXISTS (
             SELECT 1
               FROM "product_variants" v
              WHERE v.product_id = p.id
                AND v.image_url IS NOT NULL
                AND btrim(v.image_url) <> ''
           )) AS "productsWithoutAnyImage"`,
  );

  const [stockMovements] = await queryRows<StockMovementRow>(
    runner,
    `SELECT count(*)::int AS "variantsWithoutMovements"
       FROM "product_variants" v
      WHERE NOT EXISTS (
        SELECT 1
          FROM "inventory_movements" m
         WHERE m.item_type = 'variant'
           AND m.item_id = v.id
      )`,
  );

  const thresholdHours = Math.max(
    1,
    parseInt(process.env.UNPAID_ORDER_EXPIRY_HOURS ?? '24', 10) || 24,
  );
  const [staleAwaitingPayment] = await queryRows<StaleOrderRow>(
    runner,
    `SELECT count(*)::int AS "count"
       FROM "orders"
      WHERE status = 'awaiting_payment'
        AND payment_status = 'unpaid'
        AND created_at < now() - ($1::int * interval '1 hour')`,
    [thresholdHours],
  );

  const [refreshTokens] = await queryRows<RefreshTokenRow>(
    runner,
    `SELECT count(*)::int AS "total",
            count(*) FILTER (WHERE revoked_at IS NOT NULL)::int AS "revoked",
            count(*) FILTER (WHERE expires_at < now())::int AS "expired",
            count(*) FILTER (
              WHERE revoked_at IS NOT NULL AND expires_at < now()
            )::int AS "revokedAndExpired"
       FROM "refresh_tokens"`,
  );

  return {
    tool: 'db:hygiene',
    version: 1,
    testUsers,
    privilegedUsers: {
      roles: PRIVILEGED_ROLES,
      byRole: privilegedUsers,
    },
    categoryVariants,
    shippingStates,
    guestEmailCollisions,
    images,
    stockMovements,
    staleAwaitingPayment: {
      thresholdHours,
      count: staleAwaitingPayment.count,
    },
    refreshTokens,
  };
}

async function main(): Promise<void> {
  assertReadOnlyAllowed('db:hygiene');
  const report = await runReadOnly(buildHygieneReport);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(`db:hygiene failed: ${safeErrorMessage(error)}\n`);
    process.exitCode = 1;
  });
}
