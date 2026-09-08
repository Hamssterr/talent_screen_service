import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateJobsAndSeedPermissions1788620000000 implements MigrationInterface {
  name = 'CreateJobsAndSeedPermissions1788620000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Tạo Enum status cho jobs
    await queryRunner.query(
      `CREATE TYPE "public"."jobs_status_enum" AS ENUM('draft', 'open', 'closed')`,
    );

    // 2. Tạo bảng jobs
    await queryRunner.query(
      `CREATE TABLE "jobs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "owner_id" uuid NOT NULL,
        "title" character varying(200) NOT NULL,
        "description" text NOT NULL,
        "required_skills" jsonb NOT NULL DEFAULT '[]',
        "evaluation_criteria" jsonb NOT NULL DEFAULT '[]',
        "status" "public"."jobs_status_enum" NOT NULL DEFAULT 'draft',
        "version" integer NOT NULL DEFAULT 1,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_jobs_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_jobs_owner_id" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT
      )`,
    );

    // 3. Tạo các indexes phục vụ query và list pagination
    await queryRunner.query(
      `CREATE INDEX "IDX_jobs_owner_status_created" ON "jobs" ("owner_id", "status", "created_at" DESC, "id" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_jobs_status_created" ON "jobs" ("status", "created_at" DESC, "id" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_jobs_deleted_at" ON "jobs" ("deleted_at")`,
    );

    // 4. Seed các permission cho module Jobs
    await queryRunner.query(
      `INSERT INTO "permissions" ("id", "key", "name", "resource", "action", "isSystem", "isActive") VALUES
        ('10000000-0000-4000-8000-000000000013', 'jobs:read', 'Read jobs', 'jobs', 'read', true, true),
        ('10000000-0000-4000-8000-000000000014', 'jobs:create', 'Create jobs', 'jobs', 'create', true, true),
        ('10000000-0000-4000-8000-000000000015', 'jobs:update', 'Update jobs', 'jobs', 'update', true, true),
        ('10000000-0000-4000-8000-000000000016', 'jobs:close', 'Close jobs', 'jobs', 'close', true, true),
        ('10000000-0000-4000-8000-000000000017', 'jobs:manage', 'Manage all jobs', 'jobs', 'manage', true, true)
      ON CONFLICT ("key") DO NOTHING`,
    );

    // 5. Gán toàn bộ 5 permission cho role 'admin'
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT '00000000-0000-4000-8000-000000000001', "id"
      FROM "permissions"
      WHERE "key" IN ('jobs:read', 'jobs:create', 'jobs:update', 'jobs:close', 'jobs:manage')
      ON CONFLICT ("role_id", "permission_id") DO NOTHING`,
    );

    // 6. Gán 4 permission cho role 'hr' (không có jobs:manage)
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT '00000000-0000-4000-8000-000000000002', "id"
      FROM "permissions"
      WHERE "key" IN ('jobs:read', 'jobs:create', 'jobs:update', 'jobs:close')
      ON CONFLICT ("role_id", "permission_id") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Thu hồi role_permissions liên quan đến jobs
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "permission_id" IN (
        SELECT "id" FROM "permissions" WHERE "key" LIKE 'jobs:%'
      )`,
    );

    // Xóa permissions của jobs
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "key" LIKE 'jobs:%'`,
    );

    // Xóa indexes và bảng jobs
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_jobs_deleted_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_jobs_status_created"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_jobs_owner_status_created"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "jobs"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."jobs_status_enum"`);
  }
}
