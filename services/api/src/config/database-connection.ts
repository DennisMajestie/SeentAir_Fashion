/**
 * One place that decides how we reach Postgres, shared by the running app
 * and the migration/seed CLI so the two can never drift apart.
 *
 * Managed hosts (Render, Railway, Heroku, Supabase…) hand out a single
 * DATABASE_URL and terminate TLS with their own certificate authority, so
 * connections need SSL with `rejectUnauthorized: false`. Local Postgres
 * uses discrete DB_* variables and no TLS at all.
 */
export interface DatabaseConnection {
  url?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  ssl?: { rejectUnauthorized: boolean };
}

/**
 * SSL is on when DB_SSL=true, or inferred for a managed DATABASE_URL
 * (any host that is not local). DB_SSL=false forces it off — needed for
 * Render's *internal* hostname, which is unencrypted by design.
 */
function shouldUseSsl(url: string | undefined): boolean {
  const explicit = process.env.DB_SSL;
  if (explicit !== undefined) return explicit === 'true';
  if (!url) return false;
  return !/@(localhost|127\.0\.0\.1|::1)[:/]/.test(url);
}

export function databaseConnection(): DatabaseConnection {
  const url = process.env.DATABASE_URL;
  const ssl = shouldUseSsl(url) ? { rejectUnauthorized: false } : undefined;

  // A single connection string wins when present — that is what managed
  // Postgres add-ons inject, and it already carries user/password/host/db.
  if (url) return { url, ssl };

  return {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'seentair_dev',
    ssl,
  };
}
