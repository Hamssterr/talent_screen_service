import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCandidatesAndApplications1788630000000 implements MigrationInterface {
  name = 'CreateCandidatesAndApplications1788630000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Tạo Enum status cho applications
    await queryRunner.query(
      `CREATE TYPE "public"."applications_status_enum" AS ENUM('shortlisted', 'interviewing', 'under_review', 'approved', 'rejected', 'withdrawn')`,
    );

    // 2. Tạo bảng candidates
    await queryRunner.query(
      `CREATE TABLE "candidates" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "owner_id" uuid NOT NULL,
        "full_name" character varying(200) NOT NULL,
        "email" character varying(254) NOT NULL,
        "normalized_email" character varying(254) NOT NULL,
        "phone" character varying(40),
        "notes" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_candidates_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_candidates_owner_id" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT
      )`,
    );

    // 3. Unique & performance indexes cho candidates
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_candidates_owner_normalized_email_active" ON "candidates" ("owner_id", "normalized_email") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_candidates_owner_created" ON "candidates" ("owner_id", "created_at" DESC, "id" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_candidates_deleted_at" ON "candidates" ("deleted_at")`,
    );

    // 4. Tạo bảng applications
    await queryRunner.query(
      `CREATE TABLE "applications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "owner_id" uuid NOT NULL,
        "candidate_id" uuid NOT NULL,
        "job_id" uuid NOT NULL,
        "current_cv_version_id" uuid,
        "status" "public"."applications_status_enum" NOT NULL DEFAULT 'shortlisted',
        "version" integer NOT NULL DEFAULT 1,
        "notes" text,
        "withdraw_reason" text,
        "withdrawn_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_applications_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_applications_owner_id" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_applications_candidate_id" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_applications_job_id" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT
      )`,
    );

    // 5. Unique & performance indexes cho applications
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_applications_owner_candidate_job_active" ON "applications" ("owner_id", "candidate_id", "job_id") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_applications_owner_created" ON "applications" ("owner_id", "created_at" DESC, "id" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_applications_job_status_created" ON "applications" ("job_id", "status", "created_at" DESC, "id" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_applications_candidate_created" ON "applications" ("candidate_id", "created_at" DESC, "id" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_applications_deleted_at" ON "applications" ("deleted_at")`,
    );

    // 6. Seed các permission cho Candidates và Applications
    await queryRunner.query(
      `INSERT INTO "permissions" ("id", "key", "name", "resource", "action", "isSystem", "isActive") VALUES
        ('10000000-0000-4000-8000-000000000018', 'candidates:read', 'Read candidates', 'candidates', 'read', true, true),
        ('10000000-0000-4000-8000-000000000019', 'candidates:create', 'Create candidates', 'candidates', 'create', true, true),
        ('10000000-0000-4000-8000-000000000020', 'candidates:update', 'Update candidates', 'candidates', 'update', true, true),
        ('10000000-0000-4000-8000-000000000021', 'candidates:manage', 'Manage all candidates', 'candidates', 'manage', true, true),
        ('10000000-0000-4000-8000-000000000022', 'applications:read', 'Read applications', 'applications', 'read', true, true),
        ('10000000-0000-4000-8000-000000000023', 'applications:create', 'Create applications', 'applications', 'create', true, true),
        ('10000000-0000-4000-8000-000000000024', 'applications:update', 'Update applications', 'applications', 'update', true, true),
        ('10000000-0000-4000-8000-000000000025', 'applications:withdraw', 'Withdraw applications', 'applications', 'withdraw', true, true),
        ('10000000-0000-4000-8000-000000000026', 'applications:manage', 'Manage all applications', 'applications', 'manage', true, true)
      ON CONFLICT ("key") DO NOTHING`,
    );

    // 7. Gán toàn bộ 9 permission cho role 'admin'
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT '00000000-0000-4000-8000-000000000001', "id"
      FROM "permissions"
      WHERE "key" IN (
        'candidates:read', 'candidates:create', 'candidates:update', 'candidates:manage',
        'applications:read', 'applications:create', 'applications:update', 'applications:withdraw', 'applications:manage'
      )
      ON CONFLICT ("role_id", "permission_id") DO NOTHING`,
    );

    // 8. Gán 7 permission cho role 'hr' (không có candidates:manage và applications:manage)
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT '00000000-0000-4000-8000-000000000002', "id"
      FROM "permissions"
      WHERE "key" IN (
        'candidates:read', 'candidates:create', 'candidates:update',
        'applications:read', 'applications:create', 'applications:update', 'applications:withdraw'
      )
      ON CONFLICT ("role_id", "permission_id") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Thu hồi role_permissions liên quan
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "permission_id" IN (
        SELECT "id" FROM "permissions" WHERE "key" LIKE 'candidates:%' OR "key" LIKE 'applications:%'
      )`,
    );

    // Xóa permissions
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "key" LIKE 'candidates:%' OR "key" LIKE 'applications:%'`,
    );

    // Xóa indexes và bảng applications
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_applications_deleted_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_applications_candidate_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_applications_job_status_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_applications_owner_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_applications_owner_candidate_job_active"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "applications"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."applications_status_enum"`,
    );

    // Xóa indexes và bảng candidates
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_candidates_deleted_at"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_candidates_owner_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_candidates_owner_normalized_email_active"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "candidates"`);
  }
}
