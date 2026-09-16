import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase6GovernanceInsight1789510970493 implements MigrationInterface {
    name = 'Phase6GovernanceInsight1789510970493'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."campaigns_type_enum" AS ENUM('campaign', 'promotion', 'loyalty', 'visibility_boost')`);
        await queryRunner.query(`CREATE TABLE "campaigns" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "type" "public"."campaigns_type_enum" NOT NULL, "channel" character varying, "discount_percent" numeric(5,2), "start_date" date NOT NULL, "end_date" date NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_d32021d5791ed1617efaf1ac688" UNIQUE ("name"), CONSTRAINT "PK_831e3fcd4fc45b4e4c3f57a9ee4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "source" character varying`);
        await queryRunner.query(`CREATE INDEX "IDX_c7b5cc780cac8baa5465eeee95" ON "orders" ("source") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_c7b5cc780cac8baa5465eeee95"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "source"`);
        await queryRunner.query(`DROP TABLE "campaigns"`);
        await queryRunner.query(`DROP TYPE "public"."campaigns_type_enum"`);
    }

}
