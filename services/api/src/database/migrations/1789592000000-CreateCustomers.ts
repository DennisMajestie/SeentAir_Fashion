import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCustomers1789592000000 implements MigrationInterface {
  name = 'CreateCustomers1789592000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "customers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "kind" character varying NOT NULL,
        "contact" character varying,
        "email" character varying NOT NULL,
        "phone" character varying,
        "city" character varying,
        "region" character varying,
        "since" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "tags" text[] NOT NULL DEFAULT '{}',
        "note" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_customers" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "customers"`);
  }
}
