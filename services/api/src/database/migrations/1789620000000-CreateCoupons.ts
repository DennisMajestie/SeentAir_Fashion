import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Coupons, the customer wallet, redemptions and campaign banners.
 *
 * Everything here is additive and reversible. Nothing in this migration changes
 * how an order is priced today: no order column is touched, and no existing
 * table is altered. Coupons only become reachable once the feature flag is on,
 * which ships off.
 *
 * The constraints that matter:
 *  - `coupon.code` is stored already normalised (upper case, no look-alike
 *    characters) with a UNIQUE index, so entry can be case-insensitive while
 *    the stored value stays canonical and two codes can never collide.
 *  - a PERCENT_OFF coupon MUST carry `max_discount_minor`. Enforced by CHECK as
 *    well as by the DTO, so a direct insert cannot create an uncapped discount.
 *  - `customer_coupon.claim_key` is a deterministic string per claim source and
 *    UNIQUE per customer, so claiming the same code or bundle twice returns the
 *    existing row instead of minting a second one.
 *  - the partial UNIQUE index on `coupon_redemption` makes it impossible for one
 *    wallet coupon to be both reserved and confirmed, or confirmed twice. That
 *    is what stops a retried webhook from double-spending a coupon.
 */
export class CreateCoupons1789620000000 implements MigrationInterface {
  name = 'CreateCoupons1789620000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "coupon_type_enum" AS ENUM ('percent_off', 'fixed_off', 'free_delivery')`,
    );
    await queryRunner.query(
      `CREATE TYPE "coupon_audience_enum" AS ENUM ('all', 'new_customers', 'specific')`,
    );
    await queryRunner.query(
      `CREATE TYPE "customer_coupon_status_enum" AS ENUM ('available', 'used', 'expired', 'revoked')`,
    );
    await queryRunner.query(
      `CREATE TYPE "customer_coupon_source_enum" AS ENUM ('admin_issue', 'bundle_claim', 'code_claim', 'campaign')`,
    );
    await queryRunner.query(
      `CREATE TYPE "coupon_redemption_status_enum" AS ENUM ('reserved', 'confirmed', 'released')`,
    );
    await queryRunner.query(
      `CREATE TYPE "coupon_campaign_placement_enum" AS ENUM ('home_top')`,
    );
    await queryRunner.query(
      `CREATE TYPE "coupon_campaign_claim_kind_enum" AS ENUM ('coupon', 'bundle')`,
    );

    await queryRunner.query(`CREATE TABLE "coupon" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "code" varchar(8) NOT NULL,
      "name" varchar(160) NOT NULL,
      "description" text,
      "type" "coupon_type_enum" NOT NULL,
      "value" NUMERIC(12,2) NOT NULL DEFAULT 0,
      "max_discount" NUMERIC(12,2),
      "min_spend" NUMERIC(12,2),
      "starts_at" TIMESTAMP,
      "expires_at" TIMESTAMP,
      "usage_cap" INTEGER,
      "per_customer_cap" INTEGER NOT NULL DEFAULT 1,
      "audience" "coupon_audience_enum" NOT NULL DEFAULT 'all',
      "applies_to_sale_items" boolean NOT NULL DEFAULT false,
      "include_products" uuid[],
      "exclude_products" uuid[],
      "include_categories" uuid[],
      "exclude_categories" uuid[],
      "is_active" boolean NOT NULL DEFAULT true,
      "times_used" INTEGER NOT NULL DEFAULT 0,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_coupon" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_coupon_code" UNIQUE ("code"),
      CONSTRAINT "CHK_coupon_value_non_negative" CHECK ("value" >= 0),
      CONSTRAINT "CHK_coupon_max_discount_non_negative" CHECK ("max_discount" IS NULL OR "max_discount" >= 0),
      CONSTRAINT "CHK_coupon_min_spend_non_negative" CHECK ("min_spend" IS NULL OR "min_spend" >= 0),
      CONSTRAINT "CHK_coupon_percent_range" CHECK ("type" <> 'percent_off' OR ("value" >= 0 AND "value" <= 100)),
      CONSTRAINT "CHK_coupon_percent_requires_cap" CHECK ("type" <> 'percent_off' OR "max_discount" IS NOT NULL),
      CONSTRAINT "CHK_coupon_caps_positive" CHECK (("usage_cap" IS NULL OR "usage_cap" > 0) AND "per_customer_cap" > 0),
      CONSTRAINT "CHK_coupon_window" CHECK ("expires_at" IS NULL OR "starts_at" IS NULL OR "expires_at" > "starts_at"),
      CONSTRAINT "CHK_coupon_free_delivery_has_no_value" CHECK ("type" <> 'free_delivery' OR "value" = 0)
    )`);

    await queryRunner.query(`CREATE TABLE "coupon_bundle" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "name" varchar(160) NOT NULL,
      "description" text,
      "is_active" boolean NOT NULL DEFAULT true,
      "starts_at" TIMESTAMP,
      "expires_at" TIMESTAMP,
      "claim_cap" INTEGER,
      "per_customer_claim_cap" INTEGER NOT NULL DEFAULT 1,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_coupon_bundle" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_coupon_bundle_claim_cap" CHECK ("claim_cap" IS NULL OR "claim_cap" > 0),
      CONSTRAINT "CHK_coupon_bundle_per_customer_cap" CHECK ("per_customer_claim_cap" > 0),
      CONSTRAINT "CHK_coupon_bundle_window" CHECK ("expires_at" IS NULL OR "starts_at" IS NULL OR "expires_at" > "starts_at")
    )`);

    await queryRunner.query(`CREATE TABLE "coupon_bundle_item" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "bundle_id" uuid NOT NULL,
      "coupon_id" uuid NOT NULL,
      CONSTRAINT "PK_coupon_bundle_item" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_coupon_bundle_item" UNIQUE ("bundle_id", "coupon_id"),
      CONSTRAINT "FK_coupon_bundle_item_bundle" FOREIGN KEY ("bundle_id") REFERENCES "coupon_bundle"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
      CONSTRAINT "FK_coupon_bundle_item_coupon" FOREIGN KEY ("coupon_id") REFERENCES "coupon"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    )`);

    await queryRunner.query(`CREATE TABLE "coupon_campaign" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "badge_text" varchar(40),
      "headline" varchar(160) NOT NULL,
      "offer_text" varchar(255),
      "label_text" varchar(60) NOT NULL DEFAULT 'Limited time offer',
      "starts_at" TIMESTAMP NOT NULL,
      "ends_at" TIMESTAMP NOT NULL,
      "placement" "coupon_campaign_placement_enum" NOT NULL DEFAULT 'home_top',
      "claim_kind" "coupon_campaign_claim_kind_enum" NOT NULL,
      "coupon_id" uuid,
      "bundle_id" uuid,
      "is_active" boolean NOT NULL DEFAULT true,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_coupon_campaign" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_coupon_campaign_window" CHECK ("ends_at" > "starts_at"),
      CONSTRAINT "CHK_coupon_campaign_target" CHECK (
        ("claim_kind" = 'coupon' AND "coupon_id" IS NOT NULL AND "bundle_id" IS NULL) OR
        ("claim_kind" = 'bundle' AND "bundle_id" IS NOT NULL AND "coupon_id" IS NULL)
      ),
      CONSTRAINT "FK_coupon_campaign_coupon" FOREIGN KEY ("coupon_id") REFERENCES "coupon"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
      CONSTRAINT "FK_coupon_campaign_bundle" FOREIGN KEY ("bundle_id") REFERENCES "coupon_bundle"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_coupon_campaign_placement" ON "coupon_campaign" ("placement", "is_active", "starts_at", "ends_at")`,
    );

    await queryRunner.query(`CREATE TABLE "customer_coupon" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "customer_id" uuid NOT NULL,
      "coupon_id" uuid NOT NULL,
      "status" "customer_coupon_status_enum" NOT NULL DEFAULT 'available',
      "source" "customer_coupon_source_enum" NOT NULL,
      "campaign_id" uuid,
      "claim_key" varchar(80) NOT NULL,
      "claimed_at" TIMESTAMP NOT NULL DEFAULT now(),
      "expires_at" TIMESTAMP,
      "redeemed_order_id" uuid,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_customer_coupon" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_customer_coupon_claim" UNIQUE ("customer_id", "claim_key"),
      CONSTRAINT "FK_customer_coupon_customer" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
      CONSTRAINT "FK_customer_coupon_coupon" FOREIGN KEY ("coupon_id") REFERENCES "coupon"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
      CONSTRAINT "FK_customer_coupon_campaign" FOREIGN KEY ("campaign_id") REFERENCES "coupon_campaign"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_customer_coupon_wallet" ON "customer_coupon" ("customer_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_customer_coupon_expiry" ON "customer_coupon" ("status", "expires_at")`,
    );

    await queryRunner.query(`CREATE TABLE "coupon_redemption" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "order_id" uuid NOT NULL,
      "coupon_id" uuid NOT NULL,
      "customer_coupon_id" uuid,
      "customer_id" uuid NOT NULL,
      "status" "coupon_redemption_status_enum" NOT NULL DEFAULT 'reserved',
      "discount_minor" NUMERIC(12,2) NOT NULL,
      "snapshot" jsonb NOT NULL,
      "expires_at" TIMESTAMP,
      "released_at" TIMESTAMP,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_coupon_redemption" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_coupon_redemption_order_coupon" UNIQUE ("order_id", "coupon_id"),
      CONSTRAINT "UQ_coupon_redemption_order_wallet" UNIQUE ("order_id", "customer_coupon_id"),
      CONSTRAINT "CHK_coupon_redemption_discount_non_negative" CHECK ("discount_minor" >= 0),
      CONSTRAINT "FK_coupon_redemption_coupon" FOREIGN KEY ("coupon_id") REFERENCES "coupon"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
      CONSTRAINT "FK_coupon_redemption_wallet" FOREIGN KEY ("customer_coupon_id") REFERENCES "customer_coupon"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    )`);
    // The guarantee that one wallet coupon cannot be spent twice: at most one row
    // per customer_coupon may be reserved or confirmed. A webhook retry that
    // tries to confirm again collides here instead of silently re-discounting.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_coupon_redemption_active_wallet" ON "coupon_redemption" ("customer_coupon_id") WHERE "status" IN ('reserved', 'confirmed')`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_coupon_redemption_coupon_status" ON "coupon_redemption" ("coupon_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_coupon_redemption_sweeper" ON "coupon_redemption" ("status", "expires_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "coupon_redemption"`);
    await queryRunner.query(`ALTER TABLE "customer_coupon" DROP CONSTRAINT "FK_customer_coupon_campaign"`);
    await queryRunner.query(`DROP TABLE "customer_coupon"`);
    await queryRunner.query(`DROP TABLE "coupon_campaign"`);
    await queryRunner.query(`DROP TABLE "coupon_bundle_item"`);
    await queryRunner.query(`DROP TABLE "coupon_bundle"`);
    await queryRunner.query(`DROP TABLE "coupon"`);
    await queryRunner.query(`DROP TYPE "coupon_campaign_claim_kind_enum"`);
    await queryRunner.query(`DROP TYPE "coupon_campaign_placement_enum"`);
    await queryRunner.query(`DROP TYPE "coupon_redemption_status_enum"`);
    await queryRunner.query(`DROP TYPE "customer_coupon_source_enum"`);
    await queryRunner.query(`DROP TYPE "customer_coupon_status_enum"`);
    await queryRunner.query(`DROP TYPE "coupon_audience_enum"`);
    await queryRunner.query(`DROP TYPE "coupon_type_enum"`);
  }
}