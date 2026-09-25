import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase 9 — closes the backend gaps surfaced by the admin-dashboard
 * deliverables audit (the "Group A" features). Everything here is additive:
 * new optional columns, new tables, and two DB-level hash chains.
 *
 * Hash chains:
 *   - audit_log_entries and inventory_movements are append-only ledgers.
 *     Each row now carries prev_hash + entry_hash computed IN THE DATABASE by
 *     a BEFORE INSERT trigger (same implementation for backfilled rows and
 *     for the GET .../verify endpoints), so tamper-evidence cannot drift
 *     from the write path. Verification recomputes each row centrally.
 */
export class Phase9AdminGaps1789520000000 implements MigrationInterface {
    name = 'Phase9AdminGaps1789520000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

        // --- Chain hash helper + triggers -----------------------------------
        // Hash input = prev_hash + id + action/payload + serialized jsonb +
        // precise timestamp. jsonb::text is deterministic (keys sorted), so
        // the same expression in the verification query always reproduces it.
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION seentair_chain_hash(
                id_value uuid,
                prev_hash_value varchar,
                action_value varchar,
                before_value jsonb,
                after_value jsonb,
                stamp timestamptz
            ) RETURNS varchar(64) AS $$
                SELECT encode(digest(
                    coalesce(prev_hash_value, '') || id_value::text || coalesce(action_value, '') ||
                    coalesce(to_jsonb(before_value)::text, 'null') ||
                    coalesce(to_jsonb(after_value)::text, 'null') ||
                    to_char(coalesce(stamp, now()), 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
                    'sha256'), 'hex')
            $$ LANGUAGE sql IMMUTABLE`);

        // --- Audit hash chain -----------------------------------------------
        await queryRunner.query(`ALTER TABLE "audit_log_entries" ADD "prev_hash" varchar(64)`);
        await queryRunner.query(`ALTER TABLE "audit_log_entries" ADD "entry_hash" varchar(64)`);

        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION seentair_hash_audit_trigger() RETURNS trigger AS $$
            DECLARE prev varchar(64);
            BEGIN
                SELECT entry_hash INTO prev FROM "audit_log_entries"
                ORDER BY "timestamp" DESC, id DESC LIMIT 1;
                NEW.prev_hash := prev;
                NEW.entry_hash := seentair_chain_hash(
                    NEW.id, prev, NEW.action, NEW.before_state, NEW.after_state, NEW."timestamp");
                RETURN NEW;
            END $$ LANGUAGE plpgsql`);
        await queryRunner.query(`
            CREATE TRIGGER "trg_audit_hash" BEFORE INSERT ON "audit_log_entries"
            FOR EACH ROW EXECUTE FUNCTION seentair_hash_audit_trigger()`);

        // Backfill legacy audit rows so the chain covers the whole ledger
        // (recursive CTE: each row hashes the previous row's entry_hash).
        await queryRunner.query(`
            WITH RECURSIVE chain AS (
                SELECT id, action, before_state, after_state, "timestamp",
                       NULL::varchar(64) AS prev_hash,
                       seentair_chain_hash(id, NULL, action, before_state, after_state, "timestamp")::varchar(64) AS entry_hash,
                       1::bigint AS rn
                FROM (SELECT id, action, before_state, after_state, "timestamp",
                             row_number() OVER (ORDER BY "timestamp" ASC, id ASC) AS rn
                      FROM "audit_log_entries") ranked
                WHERE rn = 1
                UNION ALL
                SELECT r.id, r.action, r.before_state, r.after_state, r."timestamp",
                       c.entry_hash::varchar(64) AS prev_hash,
                       seentair_chain_hash(r.id, c.entry_hash, r.action, r.before_state, r.after_state, r."timestamp")::varchar(64) AS entry_hash,
                       r.rn
                FROM (SELECT id, action, before_state, after_state, "timestamp",
                             row_number() OVER (ORDER BY "timestamp" ASC, id ASC) AS rn
                      FROM "audit_log_entries") r
                JOIN chain c ON c.rn = r.rn - 1
            )
            UPDATE "audit_log_entries" a
            SET prev_hash = c.prev_hash,
                entry_hash = c.entry_hash
            FROM chain c
            WHERE c.id = a.id`);

        await queryRunner.query(`ALTER TABLE "audit_log_entries" ALTER COLUMN "entry_hash" SET NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_audit_entry_hash" ON "audit_log_entries" ("entry_hash")`);

        // --- Inventory ledger hash chain ------------------------------------
        await queryRunner.query(`ALTER TABLE "inventory_movements" ADD "prev_hash" varchar(64)`);
        await queryRunner.query(`ALTER TABLE "inventory_movements" ADD "entry_hash" varchar(64)`);

        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION seentair_hash_movement_trigger() RETURNS trigger AS $$
            DECLARE prev varchar(64);
            BEGIN
                SELECT entry_hash INTO prev FROM "inventory_movements"
                ORDER BY "timestamp" DESC, id DESC LIMIT 1;
                NEW.prev_hash := prev;
                NEW.entry_hash := seentair_chain_hash(
                    NEW.id, prev, NEW.item_type::text,
                    NULL, jsonb_build_object(
                        'itemId', NEW.item_id::text,
                        'movementType', NEW.movement_type::text,
                        'quantityDelta', NEW.quantity_delta,
                        'actorId', NEW.actor_id::text,
                        'referenceId', NEW.reference_id),
                    NEW."timestamp");
                RETURN NEW;
            END $$ LANGUAGE plpgsql`);
        await queryRunner.query(`
            CREATE TRIGGER "trg_movement_hash" BEFORE INSERT ON "inventory_movements"
            FOR EACH ROW EXECUTE FUNCTION seentair_hash_movement_trigger()`);

        await queryRunner.query(`
            WITH RECURSIVE chain AS (
                SELECT id, item_type, item_id, movement_type, quantity_delta, actor_id, reference_id, "timestamp",
                       NULL::varchar(64) AS prev_hash,
                       seentair_chain_hash(id, NULL, item_type::text, NULL,
                           jsonb_build_object(
                               'itemId', item_id::text,
                               'movementType', movement_type::text,
                               'quantityDelta', quantity_delta,
                               'actorId', actor_id::text,
                               'referenceId', reference_id),
                           "timestamp")::varchar(64) AS entry_hash,
                       1::bigint AS rn
                FROM (SELECT id, item_type, item_id, movement_type, quantity_delta, actor_id, reference_id, "timestamp",
                             row_number() OVER (ORDER BY "timestamp" ASC, id ASC) AS rn
                      FROM "inventory_movements") ranked
                WHERE rn = 1
                UNION ALL
                SELECT r.id, r.item_type, r.item_id, r.movement_type, r.quantity_delta, r.actor_id, r.reference_id, r."timestamp",
                       c.entry_hash::varchar(64) AS prev_hash,
                       seentair_chain_hash(r.id, c.entry_hash, r.item_type::text, NULL,
                           jsonb_build_object(
                               'itemId', r.item_id::text,
                               'movementType', r.movement_type::text,
                               'quantityDelta', r.quantity_delta,
                               'actorId', r.actor_id::text,
                               'referenceId', r.reference_id),
                           r."timestamp")::varchar(64) AS entry_hash,
                       r.rn
                FROM (SELECT id, item_type, item_id, movement_type, quantity_delta, actor_id, reference_id, "timestamp",
                             row_number() OVER (ORDER BY "timestamp" ASC, id ASC) AS rn
                      FROM "inventory_movements") r
                JOIN chain c ON c.rn = r.rn - 1
            )
            UPDATE "inventory_movements" a
            SET prev_hash = c.prev_hash,
                entry_hash = c.entry_hash
            FROM chain c
            WHERE c.id = a.id`);

        await queryRunner.query(`ALTER TABLE "inventory_movements" ALTER COLUMN "entry_hash" SET NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_movement_entry_hash" ON "inventory_movements" ("entry_hash")`);

        // --- Approvals: decision justification ------------------------------
        await queryRunner.query(`ALTER TABLE "approval_requests" ADD "justification" text`);

        // --- Catalogue: garment engineering (fit note, geometry, DXF) -------
        await queryRunner.query(`ALTER TABLE "product_variants" ADD "fit_note" text`);
        await queryRunner.query(`ALTER TABLE "product_variants" ADD "pattern_geometry" jsonb`);
        await queryRunner.query(`ALTER TABLE "product_variants" ADD "dxf_url" varchar(500)`);
        await queryRunner.query(`ALTER TABLE "product_variants" ADD "storage_location" varchar(50)`);

        await queryRunner.query(`CREATE TABLE "product_bom_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "variant_id" uuid NOT NULL, "material_id" uuid NOT NULL, "quantity" numeric(10,4) NOT NULL, "note" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_bom_items" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_bom_variant" ON "product_bom_items" ("variant_id") `);
        await queryRunner.query(`ALTER TABLE "product_bom_items" ADD CONSTRAINT "FK_bom_variant" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE`);
        await queryRunner.query(`ALTER TABLE "product_bom_items" ADD CONSTRAINT "FK_bom_material" FOREIGN KEY ("material_id") REFERENCES "raw_materials"("id")`);

        // --- Materials: category, warehouse location ------------------------
        await queryRunner.query(`ALTER TABLE "raw_materials" ADD "category" varchar(50)`);
        await queryRunner.query(`ALTER TABLE "raw_materials" ADD "storage_location" varchar(50)`);
        await queryRunner.query(`ALTER TABLE "material_purchases" ADD "supplier_name" varchar(200)`);
        await queryRunner.query(`ALTER TABLE "material_purchases" ADD "lead_time_days" integer`);

        // --- Orders: fulfilment pack (address, pallet, QR stencil) ----------
        await queryRunner.query(`ALTER TABLE "orders" ADD "shipping_address" jsonb`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "gross_weight_kg" numeric(8,2)`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "pallet_ref" varchar(50)`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "qr_stencil_ref" varchar(50)`);

        // --- Logistics: consignment contents, corridor checkpoints, driver ---
        await queryRunner.query(`ALTER TABLE "delivery_legs" ADD "contents" jsonb`);
        await queryRunner.query(`ALTER TABLE "delivery_legs" ADD "checkpoints" jsonb`);
        await queryRunner.query(`ALTER TABLE "delivery_legs" ADD "driver_name" varchar(120)`);
        await queryRunner.query(`ALTER TABLE "delivery_legs" ADD "driver_phone" varchar(40)`);

        // --- Returns: refund exposure, intake photos, quarantine bay tag ----
        await queryRunner.query(`ALTER TABLE "return_requests" ADD "refund_amount" numeric(12,2)`);
        await queryRunner.query(`ALTER TABLE "return_requests" ADD "photo_urls" jsonb`);
        await queryRunner.query(`ALTER TABLE "return_requests" ADD "bay_tag" varchar(50)`);

        // --- Production: barcode, scan events, line telemetry, inspector ----
        await queryRunner.query(`ALTER TABLE "production_batches" ADD "barcode" varchar(100)`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_batch_barcode" ON "production_batches" ("barcode") WHERE "barcode" IS NOT NULL`);

        await queryRunner.query(`CREATE TABLE "batch_scan_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "batch_id" uuid NOT NULL, "event_type" varchar(50) NOT NULL, "operator_id" uuid, "scanned_qty" integer, "scanned_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_batch_scan" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_batch_scan_batch" ON "batch_scan_events" ("batch_id") `);
        await queryRunner.query(`ALTER TABLE "batch_scan_events" ADD CONSTRAINT "FK_batch_scan_batch" FOREIGN KEY ("batch_id") REFERENCES "production_batches"("id") ON DELETE CASCADE`);

        await queryRunner.query(`CREATE TABLE "production_telemetry" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "batch_id" uuid NOT NULL, "stage" varchar(50) NOT NULL, "machine" varchar(80) NOT NULL, "rpm" numeric(8,2), "needle_cycles" integer, "thread_reserve_pct" numeric(5,2), "operator_id" uuid, "recorded_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_prod_telemetry" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_telemetry_batch" ON "production_telemetry" ("batch_id") `);
        await queryRunner.query(`ALTER TABLE "production_telemetry" ADD CONSTRAINT "FK_telemetry_batch" FOREIGN KEY ("batch_id") REFERENCES "production_batches"("id") ON DELETE CASCADE`);

        await queryRunner.query(`ALTER TABLE "qc_rejections" ADD "inspector_id" uuid`);

        // --- Tech packs (versioned garment specifications) ------------------
        await queryRunner.query(`CREATE TABLE "tech_packs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "variant_id" uuid NOT NULL, "silhouette" varchar(80), "target_yield_units" integer, "cutting_efficiency_pct" numeric(6,2), "graded_measurements" jsonb, "stitch_protocol" text, "laydown_protocol" text, "dxf_url" varchar(500), "revision" integer NOT NULL DEFAULT '1', "status" varchar(20) NOT NULL DEFAULT 'draft', "approved_by" uuid, "approved_at" TIMESTAMP WITH TIME ZONE, "updated_by" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_tech_packs" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_techpack_variant" ON "tech_packs" ("variant_id") `);
        await queryRunner.query(`ALTER TABLE "tech_packs" ADD CONSTRAINT "FK_techpack_variant" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE`);

        await queryRunner.query(`CREATE TABLE "tech_pack_revisions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tech_pack_id" uuid NOT NULL, "revision" integer NOT NULL, "snapshot" jsonb NOT NULL, "created_by" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_techpack_revisions" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_techpack_rev" ON "tech_pack_revisions" ("tech_pack_id") `);
        await queryRunner.query(`ALTER TABLE "tech_pack_revisions" ADD CONSTRAINT "FK_techpack_rev_pack" FOREIGN KEY ("tech_pack_id") REFERENCES "tech_packs"("id") ON DELETE CASCADE`);

        // --- Suppliers (certified-mill directory; purchases carry free-text history) ---
        await queryRunner.query(`CREATE TABLE "suppliers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" varchar(200) NOT NULL, "category" varchar(80), "location" varchar(200), "certified" boolean NOT NULL DEFAULT false, "sla_score" numeric(5,2), "quota_units" integer, "compliance_notes" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_suppliers" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_supplier_name" ON "suppliers" ("name") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "suppliers"`);
        await queryRunner.query(`DROP TABLE "tech_pack_revisions"`);
        await queryRunner.query(`DROP TABLE "tech_packs"`);
        await queryRunner.query(`ALTER TABLE "qc_rejections" DROP COLUMN "inspector_id"`);
        await queryRunner.query(`DROP TABLE "production_telemetry"`);
        await queryRunner.query(`DROP TABLE "batch_scan_events"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_batch_barcode"`);
        await queryRunner.query(`ALTER TABLE "production_batches" DROP COLUMN "barcode"`);
        await queryRunner.query(`ALTER TABLE "return_requests" DROP COLUMN "bay_tag"`);
        await queryRunner.query(`ALTER TABLE "return_requests" DROP COLUMN "photo_urls"`);
        await queryRunner.query(`ALTER TABLE "return_requests" DROP COLUMN "refund_amount"`);
        await queryRunner.query(`ALTER TABLE "delivery_legs" DROP COLUMN "driver_phone"`);
        await queryRunner.query(`ALTER TABLE "delivery_legs" DROP COLUMN "driver_name"`);
        await queryRunner.query(`ALTER TABLE "delivery_legs" DROP COLUMN "checkpoints"`);
        await queryRunner.query(`ALTER TABLE "delivery_legs" DROP COLUMN "contents"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "qr_stencil_ref"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "pallet_ref"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "gross_weight_kg"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "shipping_address"`);
        await queryRunner.query(`ALTER TABLE "material_purchases" DROP COLUMN "lead_time_days"`);
        await queryRunner.query(`ALTER TABLE "material_purchases" DROP COLUMN "supplier_name"`);
        await queryRunner.query(`ALTER TABLE "raw_materials" DROP COLUMN "storage_location"`);
        await queryRunner.query(`ALTER TABLE "raw_materials" DROP COLUMN "category"`);
        await queryRunner.query(`ALTER TABLE "product_bom_items" DROP CONSTRAINT "FK_bom_material"`);
        await queryRunner.query(`ALTER TABLE "product_bom_items" DROP CONSTRAINT "FK_bom_variant"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bom_variant"`);
        await queryRunner.query(`DROP TABLE "product_bom_items"`);
        await queryRunner.query(`ALTER TABLE "product_variants" DROP COLUMN "storage_location"`);
        await queryRunner.query(`ALTER TABLE "product_variants" DROP COLUMN "dxf_url"`);
        await queryRunner.query(`ALTER TABLE "product_variants" DROP COLUMN "pattern_geometry"`);
        await queryRunner.query(`ALTER TABLE "product_variants" DROP COLUMN "fit_note"`);
        await queryRunner.query(`ALTER TABLE "approval_requests" DROP COLUMN "justification"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_movement_entry_hash"`);
        await queryRunner.query(`ALTER TABLE "inventory_movements" DROP COLUMN "entry_hash"`);
        await queryRunner.query(`ALTER TABLE "inventory_movements" DROP COLUMN "prev_hash"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_audit_entry_hash"`);
        await queryRunner.query(`ALTER TABLE "audit_log_entries" DROP COLUMN "entry_hash"`);
        await queryRunner.query(`ALTER TABLE "audit_log_entries" DROP COLUMN "prev_hash"`);
        await queryRunner.query(`DROP TRIGGER "trg_movement_hash" ON "inventory_movements"`);
        await queryRunner.query(`DROP TRIGGER "trg_audit_hash" ON "audit_log_entries"`);
        await queryRunner.query(`DROP FUNCTION seentair_hash_movement_trigger()`);
        await queryRunner.query(`DROP FUNCTION seentair_hash_audit_trigger()`);
        await queryRunner.query(`DROP FUNCTION seentair_chain_hash(uuid, varchar, varchar, jsonb, jsonb, timestamptz)`);
    }

}