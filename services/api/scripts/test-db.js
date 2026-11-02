require('dotenv').config(
  process.env.DOTENV_CONFIG_PATH ? { path: process.env.DOTENV_CONFIG_PATH } : undefined,
);

const { randomBytes } = require('crypto');
const { spawnSync } = require('child_process');
const { Pool } = require('pg');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function assertDisposableDatabase(env) {
  if (env.NODE_ENV === 'production') {
    throw new Error('test:db is not allowed when NODE_ENV=production.');
  }
  if (env.DATABASE_URL) {
    throw new Error('test:db refuses DATABASE_URL; configure the dedicated local DB_* target.');
  }
  if (!LOCAL_HOSTS.has(env.DB_HOST ?? 'localhost')) {
    throw new Error('test:db requires DB_HOST to be localhost, 127.0.0.1, or ::1.');
  }
  if (!/^[a-z0-9_]+_test$/i.test(env.DB_NAME ?? '')) {
    throw new Error('test:db requires an explicit DB_NAME ending in _test.');
  }
  if (env.DB_DISPOSABLE !== 'true' || env.DB_ALLOW_RESET !== 'true') {
    throw new Error('test:db requires DB_DISPOSABLE=true and DB_ALLOW_RESET=true.');
  }
}

module.exports = { assertDisposableDatabase };

function runNpm(args) {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Command failed: npm ${args.join(' ')} (exit ${result.status ?? 'unknown'}).`);
  }
}

function quoteIdentifier(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function resetSchema() {
  const pool = new Pool({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number.parseInt(process.env.DB_PORT ?? '5432', 10),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME,
    ssl: false,
  });
  let client;
  try {
    client = await pool.connect();
    const result = await client.query('SELECT current_database() AS name');
    if (result.rows[0]?.name !== process.env.DB_NAME) {
      throw new Error('Connected database did not match DB_NAME; refusing to reset schema.');
    }
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
  } finally {
    client?.release();
    await pool.end();
  }
}

async function readTableCounts() {
  const pool = new Pool({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number.parseInt(process.env.DB_PORT ?? '5432', 10),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME,
    ssl: false,
  });
  let client;
  try {
    client = await pool.connect();
    const tables = await client.query(
      `SELECT c.relname AS name
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind IN ('r', 'p')
        ORDER BY c.relname`,
    );
    const counts = [];
    for (const { name } of tables.rows) {
      const result = await client.query(
        `SELECT count(*)::int AS count FROM public.${quoteIdentifier(name)}`,
      );
      counts.push({ table: name, count: result.rows[0].count });
    }
    return counts;
  } finally {
    client?.release();
    await pool.end();
  }
}

async function readSeedCounts() {
  const pool = new Pool({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number.parseInt(process.env.DB_PORT ?? '5432', 10),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME,
    ssl: false,
  });
  let client;
  try {
    client = await pool.connect();
    const [roles, permissions, products, variants, zones, rates, usersByRole] = await Promise.all([
      client.query('SELECT count(*)::int AS count FROM roles'),
      client.query('SELECT count(*)::int AS count FROM permissions'),
      client.query('SELECT count(*)::int AS count FROM products'),
      client.query('SELECT count(*)::int AS count FROM product_variants'),
      client.query('SELECT count(*)::int AS count FROM checkout_shipping_zones'),
      client.query('SELECT count(*)::int AS count FROM checkout_shipping_rates'),
      client.query(
        `SELECT r.name AS role, count(u.id)::int AS count
           FROM roles r
           LEFT JOIN users u ON u.role_id = r.id
          GROUP BY r.name
          ORDER BY r.name`,
      ),
    ]);
    return {
      roles: roles.rows[0].count,
      permissions: permissions.rows[0].count,
      usersByRole: usersByRole.rows,
      products: products.rows[0].count,
      variants: variants.rows[0].count,
      shippingZones: zones.rows[0].count,
      shippingRates: rates.rows[0].count,
    };
  } finally {
    client?.release();
    await pool.end();
  }
}

async function main() {
  runNpm(['run', 'test:db:guards']);
  assertDisposableDatabase(process.env);

  process.env.NODE_ENV = 'test';
  process.env.ALLOW_SEED = 'true';
  process.env.DB_SEED_TEST = 'true';
  process.env.DB_RECONCILE_TEST = 'true';
  process.env.DB_HYGIENE_TEST = 'true';
  process.env.DB_VERIFY_LEDGERS_TEST = 'true';
  process.env.DB_SSL = 'false';
  process.env.SEED_USER_PASSWORD ??= randomBytes(24).toString('base64url');

  process.stdout.write(`Resetting public schema in disposable database "${process.env.DB_NAME}".\n`);
  await resetSchema();
  runNpm(['run', 'migration:run']);

  let firstPassCounts;
  for (let pass = 1; pass <= 2; pass += 1) {
    process.stdout.write(`Running all seeds, pass ${pass}/2.\n`);
    runNpm(['run', 'seed']);
    runNpm(['run', 'seed:catalogue']);
    runNpm(['run', 'seed:shipping']);

    const counts = await readTableCounts();
    const seedCounts = await readSeedCounts();
    if (
      firstPassCounts &&
      (JSON.stringify(counts) !== JSON.stringify(firstPassCounts.tables) ||
        JSON.stringify(seedCounts) !== JSON.stringify(firstPassCounts.seedCounts))
    ) {
      throw new Error('Database table counts changed on the second seed pass.');
    }
    firstPassCounts ??= { tables: counts, seedCounts };
  }
  process.stdout.write(
    `Stable counts after both seed passes:\n${JSON.stringify(firstPassCounts, null, 2)}\n`,
  );

  runNpm(['test', '--', '--runInBand']);
  runNpm(['run', 'db:reconcile']);
  runNpm(['run', 'db:hygiene']);
  runNpm(['run', 'db:verify-ledgers']);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`test:db failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
    process.exitCode = 1;
  });
}
