import type { QueryRunner } from 'typeorm';
import { AppDataSource } from '../data-source';

export function assertReadOnlyAllowed(
  tool: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV === 'production' && env.ALLOW_PROD_READONLY !== 'true') {
    throw new Error(
      `${tool} is read-only: refusing NODE_ENV=production without ALLOW_PROD_READONLY=true.`,
    );
  }
}

export async function queryRows<T>(
  runner: QueryRunner,
  sql: string,
  parameters?: unknown[],
): Promise<T[]> {
  return (await runner.query(sql, parameters)) as unknown as T[];
}

export function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[redacted-connection-string]')
    .replace(/(password|pwd)=[^\s&]+/gi, '$1=[redacted]');
}

export async function runReadOnly<T>(work: (runner: QueryRunner) => Promise<T>): Promise<T> {
  await AppDataSource.initialize();

  try {
    const runner = AppDataSource.createQueryRunner();
    try {
      await runner.connect();
      await runner.query('SET default_transaction_read_only = on');
      await runner.query("SET statement_timeout = '30s'");
      return await work(runner);
    } finally {
      await runner.release();
    }
  } finally {
    await AppDataSource.destroy();
  }
}
