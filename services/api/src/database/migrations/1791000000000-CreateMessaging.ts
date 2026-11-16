import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMessaging1791000000000 implements MigrationInterface {
  name = 'CreateMessaging1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "conversations_channel_enum" AS ENUM ('in_platform', 'whatsapp', 'sms', 'email')
    `);
    await queryRunner.query(`
      CREATE TYPE "conversations_status_enum" AS ENUM ('open', 'pending', 'closed')
    `);
    await queryRunner.query(`
      CREATE TYPE "messages_direction_enum" AS ENUM ('in', 'out')
    `);
    await queryRunner.query(`
      CREATE TABLE "conversations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "customer_id" uuid,
        "guest_token_hash" character varying(64),
        "guest_name" character varying(120),
        "guest_email" character varying(180),
        "guest_phone" character varying(32),
        "channel" "conversations_channel_enum" NOT NULL DEFAULT 'in_platform',
        "status" "conversations_status_enum" NOT NULL DEFAULT 'open',
        "related_order_id" uuid,
        "subject" character varying(180),
        "assignee_id" uuid,
        "last_message_at" TIMESTAMPTZ,
        "last_message_preview" character varying(140),
        "unread_staff" integer NOT NULL DEFAULT 0,
        "unread_customer" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_conversations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_conversations_customer" FOREIGN KEY ("customer_id")
          REFERENCES "users"("id"),
        CONSTRAINT "FK_conversations_assignee" FOREIGN KEY ("assignee_id")
          REFERENCES "users"("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "conversation_id" uuid NOT NULL,
        "direction" "messages_direction_enum" NOT NULL,
        "author_user_id" uuid,
        "author_name" character varying(120),
        "body" text NOT NULL,
        "attachment_url" character varying(512),
        "provider_ref" character varying(255),
        "read_at" TIMESTAMPTZ,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_messages" PRIMARY KEY ("id"),
        CONSTRAINT "FK_messages_conversation" FOREIGN KEY ("conversation_id")
          REFERENCES "conversations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_messages_author" FOREIGN KEY ("author_user_id")
          REFERENCES "users"("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_conversations_status_last_message" ON "conversations" ("status", "last_message_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_conversations_customer" ON "conversations" ("customer_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_messages_conversation_created_at" ON "messages" ("conversation_id", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_messages_conversation_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_conversations_customer"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_conversations_status_last_message"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "conversations"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "messages_direction_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "conversations_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "conversations_channel_enum"`);
  }
}
