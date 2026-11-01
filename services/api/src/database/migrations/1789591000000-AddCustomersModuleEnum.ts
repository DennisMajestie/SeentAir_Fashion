import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add `customers` to the permissions_module_enum so the admin access guard
 * can protect the Customers API endpoints.
 */
export class AddCustomersModuleEnum1789591000000 implements MigrationInterface {
  name = 'AddCustomersModuleEnum1789591000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."permissions_module_enum" ADD VALUE 'customers'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Cannot remove an enum value in PostgreSQL. This is intentionally a no-op.
    await queryRunner.query(`-- noop: cannot remove enum value`);
  }
}
