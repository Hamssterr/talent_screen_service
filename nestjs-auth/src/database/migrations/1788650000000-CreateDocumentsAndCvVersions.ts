import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDocumentsAndCvVersions1788650000000 implements MigrationInterface {
  name = 'CreateDocumentsAndCvVersions1788650000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Tạo các ENUM type cho documents & cv_versions
    await queryRunner.query(
      `CREATE TYPE "public"."cv_versions_storage_provider_enum" AS ENUM('local', 'cloudinary')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."cv_versions_extraction_status_enum" AS ENUM('pending', 'processing', 'ready', 'failed', 'needs_manual_input')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."cv_versions_profile_status_enum" AS ENUM('draft', 'approved')`,
    );

    // 2. Tạo bảng cv_versions
    await queryRunner.query(
      `CREATE TABLE "cv_versions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "owner_id" uuid NOT NULL,
        "application_id" uuid NOT NULL,
        "version" integer NOT NULL DEFAULT 1,
        "original_filename" character varying(255) NOT NULL,
        "storage_provider" "public"."cv_versions_storage_provider_enum" NOT NULL,
        "storage_key" character varying(500) NOT NULL,
        "storage_metadata" jsonb,
        "mime_type" character varying(100) NOT NULL,
        "size_bytes" bigint NOT NULL,
        "sha256" character(64) NOT NULL,
        "page_count" integer,
        "extraction_status" "public"."cv_versions_extraction_status_enum" NOT NULL DEFAULT 'pending',
        "processing_version" integer NOT NULL DEFAULT 1,
        "extracted_text" text,
        "profile_json" jsonb,
        "profile_status" "public"."cv_versions_profile_status_enum" NOT NULL DEFAULT 'draft',
        "profile_version" integer NOT NULL DEFAULT 1,
        "profile_approved_by" uuid,
        "profile_approved_at" TIMESTAMP WITH TIME ZONE,
        "error_code" character varying(100),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_cv_versions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cv_versions_owner_id" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_cv_versions_application_id" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_cv_versions_profile_approved_by" FOREIGN KEY ("profile_approved_by") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "UQ_cv_versions_storage_key" UNIQUE ("storage_key"),
        CONSTRAINT "UQ_cv_versions_app_version" UNIQUE ("application_id", "version"),
        CONSTRAINT "UQ_cv_versions_app_id" UNIQUE ("application_id", "id"),
        CONSTRAINT "CHK_cv_versions_version" CHECK ("version" >= 1),
        CONSTRAINT "CHK_cv_versions_profile_version" CHECK ("profile_version" >= 1),
        CONSTRAINT "CHK_cv_versions_processing_version" CHECK ("processing_version" >= 1),
        CONSTRAINT "CHK_cv_versions_size_bytes" CHECK ("size_bytes" > 0)
      )`,
    );

    // 3. Tạo Indexes cho cv_versions
    await queryRunner.query(
      `CREATE INDEX "IDX_cv_versions_application_created" ON "cv_versions" ("application_id", "created_at" DESC, "id" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cv_versions_owner_created" ON "cv_versions" ("owner_id", "created_at" DESC, "id" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cv_versions_extraction_status_created" ON "cv_versions" ("extraction_status", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cv_versions_deleted_at" ON "cv_versions" ("deleted_at")`,
    );

    // 4. Composite Foreign Key từ applications (id, current_cv_version_id) -> cv_versions (application_id, id)
    await queryRunner.query(
      `ALTER TABLE "applications" ADD CONSTRAINT "FK_applications_current_cv_version" FOREIGN KEY ("id", "current_cv_version_id") REFERENCES "cv_versions"("application_id", "id") ON DELETE RESTRICT`,
    );

    // 5. Seed các permissions cho CV Module
    await queryRunner.query(
      `INSERT INTO "permissions" ("id", "key", "name", "resource", "action", "isSystem", "isActive") VALUES
        ('10000000-0000-4000-8000-000000000027', 'cv:read', 'Read CV versions', 'cv', 'read', true, true),
        ('10000000-0000-4000-8000-000000000028', 'cv:upload', 'Upload CV versions', 'cv', 'upload', true, true),
        ('10000000-0000-4000-8000-000000000029', 'cv:download', 'Download CV documents', 'cv', 'download', true, true),
        ('10000000-0000-4000-8000-000000000030', 'cv:update-profile', 'Update CV profiles', 'cv', 'update-profile', true, true),
        ('10000000-0000-4000-8000-000000000031', 'cv:approve-profile', 'Approve CV profiles', 'cv', 'approve-profile', true, true),
        ('10000000-0000-4000-8000-000000000032', 'cv:manage', 'Manage all CV versions', 'cv', 'manage', true, true)
      ON CONFLICT ("key") DO NOTHING`,
    );

    // 6. Gán toàn bộ 6 permissions cho role 'admin'
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT '00000000-0000-4000-8000-000000000001', "id"
      FROM "permissions"
      WHERE "key" IN (
        'cv:read', 'cv:upload', 'cv:download', 'cv:update-profile', 'cv:approve-profile', 'cv:manage'
      )
      ON CONFLICT ("role_id", "permission_id") DO NOTHING`,
    );

    // 7. Gán 5 permissions cho role 'hr' (không có cv:manage)
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT '00000000-0000-4000-8000-000000000002', "id"
      FROM "permissions"
      WHERE "key" IN (
        'cv:read', 'cv:upload', 'cv:download', 'cv:update-profile', 'cv:approve-profile'
      )
      ON CONFLICT ("role_id", "permission_id") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Thu hồi role_permissions liên quan đến cv
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "permission_id" IN (
        SELECT "id" FROM "permissions" WHERE "key" LIKE 'cv:%'
      )`,
    );

    // 2. Xóa permissions cv
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "key" LIKE 'cv:%'`,
    );

    // 3. Xóa composite FK từ applications
    await queryRunner.query(
      `ALTER TABLE "applications" DROP CONSTRAINT IF EXISTS "FK_applications_current_cv_version"`,
    );

    // 4. Xóa indexes và bảng cv_versions
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_cv_versions_deleted_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_cv_versions_extraction_status_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_cv_versions_owner_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_cv_versions_application_created"`,
    );

    await queryRunner.query(`DROP TABLE IF EXISTS "cv_versions"`);

    // 5. Xóa các enum types
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."cv_versions_profile_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."cv_versions_extraction_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."cv_versions_storage_provider_enum"`,
    );
  }
}
