import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePayrollRuns1792000000000 implements MigrationInterface {
  name = 'CreatePayrollRuns1792000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "payroll_runs_status_enum" AS ENUM ('posted', 'void')
    `);
    await queryRunner.query(`
      CREATE TABLE "payroll_runs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "period_month" character varying(7) NOT NULL,
        "lines" jsonb NOT NULL,
        "total_amount" numeric(14,2) NOT NULL,
        "status" "payroll_runs_status_enum" NOT NULL DEFAULT 'posted',
        "approval_request_id" uuid NOT NULL,
        "ledger_entry_id" uuid,
        "posted_at" TIMESTAMPTZ,
        "created_by" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payroll_runs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_payroll_runs_status" ON "payroll_runs" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "payroll_runs"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "payroll_runs_status_enum"`);
  }
}
