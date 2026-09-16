import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase2Manufacturing1789508617431 implements MigrationInterface {
    name = 'Phase2Manufacturing1789508617431'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "production_batches" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "quantity" integer NOT NULL, "stage" character varying NOT NULL, "planned_date" date, "completed_date" TIMESTAMP WITH TIME ZONE, "approval_request_id" uuid NOT NULL, "created_by" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "variant_id" uuid, CONSTRAINT "PK_35b080bec847bdb82ec04e95c9c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_1dd68a3cba8e097bf6311d0400" ON "production_batches" ("stage") `);
        await queryRunner.query(`CREATE TYPE "public"."qc_rejections_disposition_enum" AS ENUM('burned', 'repaired_restocked')`);
        await queryRunner.query(`CREATE TABLE "qc_rejections" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "quantity" integer NOT NULL DEFAULT '1', "reason" text NOT NULL, "disposition" "public"."qc_rejections_disposition_enum" NOT NULL, "recorded_by" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "batch_id" uuid, CONSTRAINT "PK_5397d55dfdc0847bc1677f5c7eb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "production_costs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "material_cost" numeric(12,2) NOT NULL DEFAULT '0', "sewing_cost" numeric(12,2) NOT NULL DEFAULT '0', "branding_cost" numeric(12,2) NOT NULL DEFAULT '0', "packaging_cost" numeric(12,2) NOT NULL DEFAULT '0', "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "batch_id" uuid, CONSTRAINT "REL_92d40ae8d5bd1109b6e52833fb" UNIQUE ("batch_id"), CONSTRAINT "PK_990de3275b75e14b9e07d1f35db" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "production_batches" ADD CONSTRAINT "FK_6ac592fd6458f463f03a8a6ccc7" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "qc_rejections" ADD CONSTRAINT "FK_19b34f91a09a6fddbbc622b4741" FOREIGN KEY ("batch_id") REFERENCES "production_batches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "production_costs" ADD CONSTRAINT "FK_92d40ae8d5bd1109b6e52833fbc" FOREIGN KEY ("batch_id") REFERENCES "production_batches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "production_costs" DROP CONSTRAINT "FK_92d40ae8d5bd1109b6e52833fbc"`);
        await queryRunner.query(`ALTER TABLE "qc_rejections" DROP CONSTRAINT "FK_19b34f91a09a6fddbbc622b4741"`);
        await queryRunner.query(`ALTER TABLE "production_batches" DROP CONSTRAINT "FK_6ac592fd6458f463f03a8a6ccc7"`);
        await queryRunner.query(`DROP TABLE "production_costs"`);
        await queryRunner.query(`DROP TABLE "qc_rejections"`);
        await queryRunner.query(`DROP TYPE "public"."qc_rejections_disposition_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1dd68a3cba8e097bf6311d0400"`);
        await queryRunner.query(`DROP TABLE "production_batches"`);
    }

}
