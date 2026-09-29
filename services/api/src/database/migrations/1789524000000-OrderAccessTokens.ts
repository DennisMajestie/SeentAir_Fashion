import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Guest checkout, step 2 (docs/phases/phase-8-guest-checkout.md §8.2).
 *
 * The tracking link a guest gets by email. Stores only the SHA-256 hash of the
 * token, mirroring password_reset_tokens, so the table is useless to anyone who
 * reads it. Rows are cut with the order (ON DELETE CASCADE) because a token
 * without its order grants nothing.
 */
export class OrderAccessTokens1789524000000 implements MigrationInterface {
  name = 'OrderAccessTokens1789524000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "order_access_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "order_id" uuid NOT NULL, "token_hash" character varying NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_order_access_tokens" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_order_access_token_hash" ON "order_access_tokens" ("token_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_order_access_token_order" ON "order_access_tokens" ("order_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_access_tokens" ADD CONSTRAINT "FK_order_access_token_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "order_access_tokens"`);
  }
}
