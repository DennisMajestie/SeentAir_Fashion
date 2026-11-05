import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateHelpTickets1789730000000 implements MigrationInterface {
  name = 'CreateHelpTickets1789730000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "help_tickets_status_enum" AS ENUM ('open', 'in_progress', 'resolved')
    `);
    await queryRunner.query(`
      CREATE TABLE "help_tickets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "subject" character varying(180) NOT NULL,
        "description" text NOT NULL,
        "status" "help_tickets_status_enum" NOT NULL DEFAULT 'open',
        "created_by" uuid NOT NULL,
        "updated_by" uuid,
        "resolved_at" TIMESTAMPTZ,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_help_tickets" PRIMARY KEY ("id"),
        CONSTRAINT "FK_help_tickets_created_by" FOREIGN KEY ("created_by")
          REFERENCES "users"("id"),
        CONSTRAINT "FK_help_tickets_updated_by" FOREIGN KEY ("updated_by")
          REFERENCES "users"("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_help_tickets_status_created_at" ON "help_tickets" ("status", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_help_tickets_status_created_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "help_tickets"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "help_tickets_status_enum"`);
  }
}
