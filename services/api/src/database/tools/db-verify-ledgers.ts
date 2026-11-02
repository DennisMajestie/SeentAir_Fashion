import type { DataSource, QueryRunner } from 'typeorm';
import { AuditService } from '../../modules/audit/audit.service';
import { AuditLogEntry } from '../../modules/audit/audit-log-entry.entity';
import { InventoryService } from '../../modules/inventory/inventory.service';
import { InventoryMovement } from '../../modules/inventory/inventory-movement.entity';
import {
  assertReadOnlyAllowed,
  queryRows,
  runReadOnly,
  safeErrorMessage,
} from './db-tooling';

interface VerifyResult {
  total: number;
  valid: number;
  broken: number;
  headHash: string | null;
}

interface BrokenRow {
  position: number;
  id: string;
  timestamp: string;
}

interface LedgerReport extends VerifyResult {
  passed: boolean;
  firstBroken: BrokenRow | null;
}

export interface VerifyLedgersReport {
  tool: 'db:verify-ledgers';
  version: 1;
  inventory: LedgerReport;
  audit: LedgerReport;
}

async function firstBrokenInventory(runner: QueryRunner): Promise<BrokenRow | null> {
  const [row] = await queryRows<BrokenRow>(
    runner,
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
     ),
     numbered AS (
       SELECT id,
              "timestamp",
              entry_hash,
              expected_hash,
              dangling,
              (row_number() OVER (ORDER BY "timestamp", id))::int AS position
         FROM linked
     )
     SELECT position,
            id,
            "timestamp"
       FROM numbered
      WHERE entry_hash IS DISTINCT FROM expected_hash OR dangling
      ORDER BY position
      LIMIT 1`,
  );
  return row ?? null;
}

async function firstBrokenAudit(runner: QueryRunner): Promise<BrokenRow | null> {
  const [row] = await queryRows<BrokenRow>(
    runner,
    `WITH linked AS (
       SELECT id,
              "timestamp",
              prev_hash,
              entry_hash,
              seentair_chain_hash(
                id,
                prev_hash,
                action,
                before_state,
                after_state,
                "timestamp") AS expected_hash,
              (prev_hash IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM audit_log_entries p WHERE p.entry_hash = audit_log_entries.prev_hash
              )) AS dangling
         FROM audit_log_entries
     ),
     numbered AS (
       SELECT id,
              "timestamp",
              entry_hash,
              expected_hash,
              dangling,
              (row_number() OVER (ORDER BY "timestamp", id))::int AS position
         FROM linked
     )
     SELECT position,
            id,
            "timestamp"
       FROM numbered
      WHERE entry_hash IS DISTINCT FROM expected_hash OR dangling
      ORDER BY position
      LIMIT 1`,
  );
  return row ?? null;
}

function toLedgerReport(result: VerifyResult, firstBroken: BrokenRow | null): LedgerReport {
  return {
    ...result,
    passed: result.broken === 0,
    firstBroken: result.broken === 0 ? null : firstBroken,
  };
}

export async function buildVerifyLedgersReport(
  runner: QueryRunner,
): Promise<VerifyLedgersReport> {
  const readOnlyDataSource = {
    query: (sql: string, parameters?: unknown[]) => runner.query(sql, parameters),
  } as unknown as DataSource;

  const inventoryService = new InventoryService(
    runner.manager.getRepository(InventoryMovement),
    readOnlyDataSource,
  );
  const auditService = new AuditService(
    runner.manager.getRepository(AuditLogEntry),
    readOnlyDataSource,
  );

  const inventoryResult = await inventoryService.verify();
  const auditResult = await auditService.verify();

  return {
    tool: 'db:verify-ledgers',
    version: 1,
    inventory: toLedgerReport(
      inventoryResult,
      inventoryResult.broken > 0 ? await firstBrokenInventory(runner) : null,
    ),
    audit: toLedgerReport(
      auditResult,
      auditResult.broken > 0 ? await firstBrokenAudit(runner) : null,
    ),
  };
}

async function main(): Promise<void> {
  assertReadOnlyAllowed('db:verify-ledgers');
  const report = await runReadOnly(buildVerifyLedgersReport);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.inventory.passed || !report.audit.passed) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(`db:verify-ledgers failed: ${safeErrorMessage(error)}\n`);
    process.exitCode = 1;
  });
}
