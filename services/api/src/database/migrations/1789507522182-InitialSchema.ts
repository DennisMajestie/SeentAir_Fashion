import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1789507522182 implements MigrationInterface {
    name = 'InitialSchema1789507522182'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "audit_log_entries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actor_id" uuid, "action" character varying NOT NULL, "before_state" jsonb, "after_state" jsonb, "timestamp" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_4f2fbddaca7c6531577e79177a4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c02c6017245e7b8caf9ec188b9" ON "audit_log_entries" ("actor_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_c75796d990c79d87bc868b8e28" ON "audit_log_entries" ("action") `);
        await queryRunner.query(`CREATE INDEX "IDX_15b66dee5e62cfcb5cfcb67898" ON "audit_log_entries" ("timestamp") `);
        await queryRunner.query(`CREATE TYPE "public"."permissions_module_enum" AS ENUM('manufacturing', 'raw_materials', 'catalogue', 'inventory', 'retail_orders', 'wholesale_orders', 'custom_orders', 'payments', 'returns', 'accounting', 'logistics', 'marketing', 'analytics', 'partners', 'staff_access', 'approvals_audit', 'communication')`);
        await queryRunner.query(`CREATE TYPE "public"."permissions_access_level_enum" AS ENUM('none', 'own', 'view', 'approve', 'full')`);
        await queryRunner.query(`CREATE TABLE "permissions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "module" "public"."permissions_module_enum" NOT NULL, "access_level" "public"."permissions_access_level_enum" NOT NULL DEFAULT 'none', "role_id" uuid, CONSTRAINT "PK_920331560282b8bd21bb02290df" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_4f3122051991832855a59ec0ae" ON "permissions" ("role_id", "module") `);
        await queryRunner.query(`CREATE TYPE "public"."users_status_enum" AS ENUM('active', 'disabled')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "phone" character varying, "email" character varying NOT NULL, "password_hash" character varying NOT NULL, "status" "public"."users_status_enum" NOT NULL DEFAULT 'active', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "role_id" uuid, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."roles_name_enum" AS ENUM('business_owner_admin', 'management', 'sales', 'inventory', 'production', 'finance_accounting', 'partner_investor', 'wholesaler', 'customer')`);
        await queryRunner.query(`CREATE TABLE "roles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" "public"."roles_name_enum" NOT NULL, CONSTRAINT "UQ_648e3f5447f725579d7d4ffdfb7" UNIQUE ("name"), CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."approval_requests_action_type_enum" AS ENUM('purchasing', 'production_start', 'price_change', 'fund_movement', 'stock_disposal')`);
        await queryRunner.query(`CREATE TYPE "public"."approval_requests_status_enum" AS ENUM('pending', 'approved', 'rejected')`);
        await queryRunner.query(`CREATE TABLE "approval_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "action_type" "public"."approval_requests_action_type_enum" NOT NULL, "payload" jsonb, "status" "public"."approval_requests_status_enum" NOT NULL DEFAULT 'pending', "decided_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "requested_by" uuid, "approved_by" uuid, CONSTRAINT "PK_484806bb8ff331b851fc75973c0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_6ed55b9173b18a5ea5c3178a2d" ON "approval_requests" ("action_type") `);
        await queryRunner.query(`CREATE INDEX "IDX_40474ff19c594757c811a1343c" ON "approval_requests" ("status") `);
        await queryRunner.query(`ALTER TABLE "permissions" ADD CONSTRAINT "FK_f10931e7bb05a3b434642ed2797" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_a2cecd1a3531c0b041e29ba46e1" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "approval_requests" ADD CONSTRAINT "FK_0bcfff2aed6c93f6fa089720b36" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "approval_requests" ADD CONSTRAINT "FK_3ca16967f343e8cfe1ddc12afc8" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "approval_requests" DROP CONSTRAINT "FK_3ca16967f343e8cfe1ddc12afc8"`);
        await queryRunner.query(`ALTER TABLE "approval_requests" DROP CONSTRAINT "FK_0bcfff2aed6c93f6fa089720b36"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_a2cecd1a3531c0b041e29ba46e1"`);
        await queryRunner.query(`ALTER TABLE "permissions" DROP CONSTRAINT "FK_f10931e7bb05a3b434642ed2797"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_40474ff19c594757c811a1343c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6ed55b9173b18a5ea5c3178a2d"`);
        await queryRunner.query(`DROP TABLE "approval_requests"`);
        await queryRunner.query(`DROP TYPE "public"."approval_requests_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."approval_requests_action_type_enum"`);
        await queryRunner.query(`DROP TABLE "roles"`);
        await queryRunner.query(`DROP TYPE "public"."roles_name_enum"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4f3122051991832855a59ec0ae"`);
        await queryRunner.query(`DROP TABLE "permissions"`);
        await queryRunner.query(`DROP TYPE "public"."permissions_access_level_enum"`);
        await queryRunner.query(`DROP TYPE "public"."permissions_module_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_15b66dee5e62cfcb5cfcb67898"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c75796d990c79d87bc868b8e28"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c02c6017245e7b8caf9ec188b9"`);
        await queryRunner.query(`DROP TABLE "audit_log_entries"`);
    }

}
