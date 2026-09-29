import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Guest checkout, step 3 (docs/phases/phase-8-guest-checkout.md §8.3).
 *
 * Proof that a registering user controls the address they signed up with. This
 * is what makes step 4 safe: guest orders are claimed by email match, so
 * without verification anyone could register with a stranger's address and
 * inherit their order history and delivery address.
 *
 * Every account that exists before this runs is backfilled as verified. They
 * were created under the old rules and locking them out of their own order
 * history would be a regression, not a security gain.
 */
export class EmailVerification1789525000000 implements MigrationInterface {
  name = 'EmailVerification1789525000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "email_verified_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`UPDATE "users" SET "email_verified_at" = now()`);

    await queryRunner.query(
      `CREATE TABLE "email_verification_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "token_hash" character varying NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_email_verification_tokens" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_email_verification_token_hash" ON "email_verification_tokens" ("token_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_email_verification_token_user" ON "email_verification_tokens" ("user_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "FK_email_verification_token_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "email_verification_tokens"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "email_verified_at"`);
  }
}
