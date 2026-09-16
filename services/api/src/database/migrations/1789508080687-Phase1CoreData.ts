import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase1CoreData1789508080687 implements MigrationInterface {
    name = 'Phase1CoreData1789508080687'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."inventory_movements_item_type_enum" AS ENUM('variant', 'material')`);
        await queryRunner.query(`CREATE TYPE "public"."inventory_movements_movement_type_enum" AS ENUM('purchase', 'production', 'sale', 'return', 'damage', 'dispatch', 'adjustment')`);
        await queryRunner.query(`CREATE TABLE "inventory_movements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "item_type" "public"."inventory_movements_item_type_enum" NOT NULL, "item_id" uuid NOT NULL, "movement_type" "public"."inventory_movements_movement_type_enum" NOT NULL, "quantity_delta" integer NOT NULL, "actor_id" uuid, "reference_id" character varying, "timestamp" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_d7597827c1dcffae889db3ab873" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_0339137136f1a856420218557e" ON "inventory_movements" ("movement_type") `);
        await queryRunner.query(`CREATE INDEX "IDX_460fa6e6cfe2683be6aecd3989" ON "inventory_movements" ("timestamp") `);
        await queryRunner.query(`CREATE INDEX "IDX_bc96616a1526db3ae9d68df156" ON "inventory_movements" ("item_type", "item_id") `);
        await queryRunner.query(`CREATE TABLE "collections" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, CONSTRAINT "UQ_ed225078e8bf65b448b69105b45" UNIQUE ("name"), CONSTRAINT "PK_21c00b1ebbd41ba1354242c5c4e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."product_variants_availability_status_enum" AS ENUM('in_stock', 'out_of_stock', 'made_to_order')`);
        await queryRunner.query(`CREATE TABLE "product_variants" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "size" character varying, "colour" character varying, "sku" character varying NOT NULL, "price_override" numeric(12,2), "image_url" character varying, "availability_status" "public"."product_variants_availability_status_enum" NOT NULL DEFAULT 'in_stock', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "product_id" uuid, CONSTRAINT "UQ_46f236f21640f9da218a063a866" UNIQUE ("sku"), CONSTRAINT "PK_281e3f2c55652d6a22c0aa59fd7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "products" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "description" text, "category" character varying, "base_price" numeric(12,2) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "collection_id" uuid, CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "raw_materials" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "unit" character varying NOT NULL, "reorder_threshold" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_633ce718b962da25ac754c6df14" UNIQUE ("name"), CONSTRAINT "PK_873309f7e7332ad627e9016090f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "material_usages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "batch_id" uuid, "quantity_used" integer NOT NULL, "recorded_by" uuid, "used_at" TIMESTAMP NOT NULL DEFAULT now(), "material_id" uuid, CONSTRAINT "PK_c30000fe21cd8389e477b3959ca" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "material_purchases" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "quantity" integer NOT NULL, "cost" numeric(12,2) NOT NULL, "note" text, "recorded_by" uuid, "purchased_at" TIMESTAMP NOT NULL DEFAULT now(), "material_id" uuid, CONSTRAINT "PK_e0772c3a202c07167122abc075e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "product_variants" ADD CONSTRAINT "FK_6343513e20e2deab45edfce1316" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "products" ADD CONSTRAINT "FK_e6c272f6bc9b9182f4311a1de7e" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "material_usages" ADD CONSTRAINT "FK_8e3ebcd53b180b712d0e0ee04e3" FOREIGN KEY ("material_id") REFERENCES "raw_materials"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "material_purchases" ADD CONSTRAINT "FK_8f711f075f39a7cd5030c68bbd6" FOREIGN KEY ("material_id") REFERENCES "raw_materials"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "material_purchases" DROP CONSTRAINT "FK_8f711f075f39a7cd5030c68bbd6"`);
        await queryRunner.query(`ALTER TABLE "material_usages" DROP CONSTRAINT "FK_8e3ebcd53b180b712d0e0ee04e3"`);
        await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT "FK_e6c272f6bc9b9182f4311a1de7e"`);
        await queryRunner.query(`ALTER TABLE "product_variants" DROP CONSTRAINT "FK_6343513e20e2deab45edfce1316"`);
        await queryRunner.query(`DROP TABLE "material_purchases"`);
        await queryRunner.query(`DROP TABLE "material_usages"`);
        await queryRunner.query(`DROP TABLE "raw_materials"`);
        await queryRunner.query(`DROP TABLE "products"`);
        await queryRunner.query(`DROP TABLE "product_variants"`);
        await queryRunner.query(`DROP TYPE "public"."product_variants_availability_status_enum"`);
        await queryRunner.query(`DROP TABLE "collections"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bc96616a1526db3ae9d68df156"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_460fa6e6cfe2683be6aecd3989"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0339137136f1a856420218557e"`);
        await queryRunner.query(`DROP TABLE "inventory_movements"`);
        await queryRunner.query(`DROP TYPE "public"."inventory_movements_movement_type_enum"`);
        await queryRunner.query(`DROP TYPE "public"."inventory_movements_item_type_enum"`);
    }

}
