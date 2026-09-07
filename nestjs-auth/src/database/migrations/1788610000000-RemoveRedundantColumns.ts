import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveRedundantColumns1788610000000 implements MigrationInterface {
  name = 'RemoveRedundantColumns1788610000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop indexes on redundant columns
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_f382af58ab36057334fb262efd"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_4305aedaa7aed08419da6a29ec"`,
    );

    // 2. Drop redundant columns from users table
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "phoneNumber"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "provider"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "googleId"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "role"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "isEmailVerified"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "deletedAt"`,
    );

    // 3. Drop unused legacy enums
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."users_provider_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."users_role_enum"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."users_provider_enum" AS ENUM('local', 'google')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('user', 'admin')`,
    );

    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "phoneNumber" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "provider" "public"."users_provider_enum" NOT NULL DEFAULT 'local'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "googleId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "role" "public"."users_role_enum" NOT NULL DEFAULT 'user'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "isEmailVerified" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "deletedAt" TIMESTAMP`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_4305aedaa7aed08419da6a29ec" ON "users" ("provider")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_f382af58ab36057334fb262efd" ON "users" ("googleId")`,
    );
  }
}
