import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase4Wholesale1789509756279 implements MigrationInterface {
    name = 'Phase4Wholesale1789509756279'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "price_tiers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "rule_description" text, "discount_percent" numeric(5,2) NOT NULL DEFAULT '0', CONSTRAINT "UQ_3bab245abf5fbf31ce70c53dbdd" UNIQUE ("name"), CONSTRAINT "PK_32e26c73f31f2d3a75bb2143d62" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."wholesale_accounts_approved_moq_status_enum" AS ENUM('pending', 'approved', 'rejected')`);
        await queryRunner.query(`CREATE TABLE "wholesale_accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "approved_moq_status" "public"."wholesale_accounts_approved_moq_status_enum" NOT NULL DEFAULT 'pending', "reviewed_by" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "user_id" uuid, "tier_id" uuid, CONSTRAINT "REL_0765f37972455aaed4a454f468" UNIQUE ("user_id"), CONSTRAINT "PK_33ac2c5fad4d73574468be984ec" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "wholesale_accounts" ADD CONSTRAINT "FK_0765f37972455aaed4a454f4686" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "wholesale_accounts" ADD CONSTRAINT "FK_b20c2af7fd2aa8ef706bcf8a617" FOREIGN KEY ("tier_id") REFERENCES "price_tiers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "wholesale_accounts" DROP CONSTRAINT "FK_b20c2af7fd2aa8ef706bcf8a617"`);
        await queryRunner.query(`ALTER TABLE "wholesale_accounts" DROP CONSTRAINT "FK_0765f37972455aaed4a454f4686"`);
        await queryRunner.query(`DROP TABLE "wholesale_accounts"`);
        await queryRunner.query(`DROP TYPE "public"."wholesale_accounts_approved_moq_status_enum"`);
        await queryRunner.query(`DROP TABLE "price_tiers"`);
    }

}
