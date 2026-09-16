import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase5Operations1789510425553 implements MigrationInterface {
    name = 'Phase5Operations1789510425553'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."return_requests_status_enum" AS ENUM('requested', 'resolved', 'rejected')`);
        await queryRunner.query(`CREATE TABLE "return_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "quantity" integer NOT NULL, "reason" text NOT NULL, "requested_at" TIMESTAMP NOT NULL DEFAULT now(), "return_deadline" TIMESTAMP WITH TIME ZONE NOT NULL, "tracking_number" character varying, "status" "public"."return_requests_status_enum" NOT NULL DEFAULT 'requested', "resolution" text, "restocked" boolean NOT NULL DEFAULT false, "damaged" boolean NOT NULL DEFAULT false, "resolved_by" uuid, "resolved_at" TIMESTAMP WITH TIME ZONE, "order_id" uuid, "variant_id" uuid, CONSTRAINT "PK_38714de8942bd9bc3a450a06889" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_e39140ca60578e42293046682a" ON "return_requests" ("status") `);
        await queryRunner.query(`CREATE TABLE "delivery_pricing" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "zone" character varying NOT NULL, "base_fee" numeric(12,2) NOT NULL, "price_per_kg" numeric(12,2) NOT NULL, CONSTRAINT "UQ_27e6be361d06b330b62c660b0d0" UNIQUE ("zone"), CONSTRAINT "PK_b43cb71553ae3868d143d4cea81" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."delivery_legs_status_enum" AS ENUM('pending', 'in_transit', 'delivered', 'failed')`);
        await queryRunner.query(`CREATE TABLE "delivery_legs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "carrier" character varying NOT NULL, "leg_number" integer NOT NULL DEFAULT '1', "status" "public"."delivery_legs_status_enum" NOT NULL DEFAULT 'pending', "tracking_ref" character varying, "weight_kg" numeric(8,2), "zone" character varying, "cost" numeric(12,2), "created_by" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "order_id" uuid, CONSTRAINT "PK_80171c7b0820a2b909fb62901aa" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_c58827d32ffdea8902565c5c2d" ON "delivery_legs" ("order_id", "leg_number") `);
        await queryRunner.query(`CREATE TYPE "public"."ledger_entries_type_enum" AS ENUM('sale', 'investment', 'expense', 'purchase', 'payroll', 'tax')`);
        await queryRunner.query(`CREATE TABLE "ledger_entries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "type" "public"."ledger_entries_type_enum" NOT NULL, "amount" numeric(14,2) NOT NULL, "category" character varying, "reference_id" character varying, "recorded_by" uuid, "entry_date" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6efcb84411d3f08b08450ae75d5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_a8781f3c6e59c59666272e896b" ON "ledger_entries" ("type") `);
        await queryRunner.query(`CREATE INDEX "IDX_81707118efae98298678848d35" ON "ledger_entries" ("entry_date") `);
        await queryRunner.query(`ALTER TABLE "return_requests" ADD CONSTRAINT "FK_c7f39dfc32be2b7be25c139ba04" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "return_requests" ADD CONSTRAINT "FK_ad9ef85a65c03bcfcd93b289805" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "delivery_legs" ADD CONSTRAINT "FK_bb7bd25478d46cf6f257aef02b6" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "delivery_legs" DROP CONSTRAINT "FK_bb7bd25478d46cf6f257aef02b6"`);
        await queryRunner.query(`ALTER TABLE "return_requests" DROP CONSTRAINT "FK_ad9ef85a65c03bcfcd93b289805"`);
        await queryRunner.query(`ALTER TABLE "return_requests" DROP CONSTRAINT "FK_c7f39dfc32be2b7be25c139ba04"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_81707118efae98298678848d35"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a8781f3c6e59c59666272e896b"`);
        await queryRunner.query(`DROP TABLE "ledger_entries"`);
        await queryRunner.query(`DROP TYPE "public"."ledger_entries_type_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c58827d32ffdea8902565c5c2d"`);
        await queryRunner.query(`DROP TABLE "delivery_legs"`);
        await queryRunner.query(`DROP TYPE "public"."delivery_legs_status_enum"`);
        await queryRunner.query(`DROP TABLE "delivery_pricing"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e39140ca60578e42293046682a"`);
        await queryRunner.query(`DROP TABLE "return_requests"`);
        await queryRunner.query(`DROP TYPE "public"."return_requests_status_enum"`);
    }

}
