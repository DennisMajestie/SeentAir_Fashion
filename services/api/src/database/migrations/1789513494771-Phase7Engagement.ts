import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase7Engagement1789513494771 implements MigrationInterface {
    name = 'Phase7Engagement1789513494771'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "profit_distributions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "period" character varying NOT NULL, "total_profit" numeric(14,2) NOT NULL, "reinvestment_amount" numeric(14,2) NOT NULL, "dividend_pool" numeric(14,2) NOT NULL, "reserve_amount" numeric(14,2) NOT NULL, "per_partner_breakdown" jsonb NOT NULL, "created_by" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_fffe0f6a30917f2ac23c2ff9fd0" UNIQUE ("period"), CONSTRAINT "PK_7e4c10579220237ef2c74f95bf7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."notifications_channel_enum" AS ENUM('in_platform', 'sms', 'whatsapp')`);
        await queryRunner.query(`CREATE TYPE "public"."notifications_status_enum" AS ENUM('sent', 'failed', 'skipped')`);
        await queryRunner.query(`CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "recipient_id" uuid NOT NULL, "channel" "public"."notifications_channel_enum" NOT NULL, "type" character varying NOT NULL, "related_order_id" uuid, "message" text NOT NULL, "status" "public"."notifications_status_enum" NOT NULL DEFAULT 'sent', "provider_ref" character varying, "sent_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_5332a4daa46fd3f4e6625dd275" ON "notifications" ("recipient_id") `);
        await queryRunner.query(`CREATE TYPE "public"."custom_order_requests_status_enum" AS ENUM('submitted', 'under_review', 'quoted', 'quote_accepted', 'paid', 'sample_in_production', 'sample_approved', 'in_production', 'fulfilled', 'delivered', 'rejected', 'cancelled')`);
        await queryRunner.query(`CREATE TABLE "custom_order_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sizes" character varying NOT NULL, "colours" character varying NOT NULL, "quantity" integer NOT NULL, "location" character varying NOT NULL, "fabric_quality" character varying NOT NULL, "description" text NOT NULL, "desired_date" date NOT NULL, "status" "public"."custom_order_requests_status_enum" NOT NULL DEFAULT 'submitted', "review_note" text, "paid_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "buyer_id" uuid, CONSTRAINT "PK_76d1c3f11fc931e327a6cc69823" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_3baeb811c5ca5cdc11d3fbbdc5" ON "custom_order_requests" ("status") `);
        await queryRunner.query(`CREATE TABLE "sample_approvals" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "buyer_approved" boolean NOT NULL DEFAULT false, "note" text, "decided_at" TIMESTAMP NOT NULL DEFAULT now(), "request_id" uuid, CONSTRAINT "REL_64c88401c420302f50f724cfb5" UNIQUE ("request_id"), CONSTRAINT "PK_5c8cb0f2712ec4340deaf2be799" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "quotations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "amount" numeric(12,2) NOT NULL, "note" text, "approved_by" uuid NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "request_id" uuid, CONSTRAINT "REL_3539926d4326673d2ab7d980dd" UNIQUE ("request_id"), CONSTRAINT "PK_6c00eb8ba181f28c21ffba7ecb1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "partners" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "equity_percentage" numeric(5,2) NOT NULL, "invested_amount" numeric(14,2) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "user_id" uuid, CONSTRAINT "REL_6aee7fd33891dbfa5ccbbdfe08" UNIQUE ("user_id"), CONSTRAINT "PK_998645b20820e4ab99aeae03b41" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "custom_order_requests" ADD CONSTRAINT "FK_19a9be56ae53d7f91a158dc17ad" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "sample_approvals" ADD CONSTRAINT "FK_64c88401c420302f50f724cfb5d" FOREIGN KEY ("request_id") REFERENCES "custom_order_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "quotations" ADD CONSTRAINT "FK_3539926d4326673d2ab7d980dd7" FOREIGN KEY ("request_id") REFERENCES "custom_order_requests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "partners" ADD CONSTRAINT "FK_6aee7fd33891dbfa5ccbbdfe084" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "partners" DROP CONSTRAINT "FK_6aee7fd33891dbfa5ccbbdfe084"`);
        await queryRunner.query(`ALTER TABLE "quotations" DROP CONSTRAINT "FK_3539926d4326673d2ab7d980dd7"`);
        await queryRunner.query(`ALTER TABLE "sample_approvals" DROP CONSTRAINT "FK_64c88401c420302f50f724cfb5d"`);
        await queryRunner.query(`ALTER TABLE "custom_order_requests" DROP CONSTRAINT "FK_19a9be56ae53d7f91a158dc17ad"`);
        await queryRunner.query(`DROP TABLE "partners"`);
        await queryRunner.query(`DROP TABLE "quotations"`);
        await queryRunner.query(`DROP TABLE "sample_approvals"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3baeb811c5ca5cdc11d3fbbdc5"`);
        await queryRunner.query(`DROP TABLE "custom_order_requests"`);
        await queryRunner.query(`DROP TYPE "public"."custom_order_requests_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5332a4daa46fd3f4e6625dd275"`);
        await queryRunner.query(`DROP TABLE "notifications"`);
        await queryRunner.query(`DROP TYPE "public"."notifications_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."notifications_channel_enum"`);
        await queryRunner.query(`DROP TABLE "profit_distributions"`);
    }

}
