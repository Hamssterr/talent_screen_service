import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateQuestionSets1788660000000 implements MigrationInterface {
  name = 'CreateQuestionSets1788660000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Tạo các ENUM types cho question_sets và question_set_items
    await queryRunner.query(
      `CREATE TYPE "public"."question_sets_language_enum" AS ENUM('vi', 'en')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."question_sets_mode_enum" AS ENUM('manual', 'ai')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."question_sets_status_enum" AS ENUM('draft', 'generating', 'approved', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."question_set_items_source_enum" AS ENUM('manual', 'ai')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."question_set_items_difficulty_enum" AS ENUM('basic', 'intermediate', 'advanced')`,
    );

    // 2. Tạo bảng question_sets
    await queryRunner.query(
      `CREATE TABLE "question_sets" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "owner_id" uuid NOT NULL,
        "application_id" uuid NOT NULL,
        "cv_version_id" uuid NOT NULL,
        "cv_profile_version" integer NOT NULL,
        "job_version" integer NOT NULL,
        "profile_snapshot" jsonb NOT NULL,
        "job_snapshot" jsonb NOT NULL,
        "language" "public"."question_sets_language_enum" NOT NULL DEFAULT 'vi',
        "mode" "public"."question_sets_mode_enum" NOT NULL DEFAULT 'manual',
        "status" "public"."question_sets_status_enum" NOT NULL DEFAULT 'draft',
        "version" integer NOT NULL DEFAULT 1,
        "generation_version" integer NOT NULL DEFAULT 1,
        "ai_run_id" uuid,
        "source_question_set_id" uuid,
        "approved_by" uuid,
        "approved_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_question_sets_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_question_sets_owner_id" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_question_sets_application_id" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_question_sets_cv_version_id" FOREIGN KEY ("cv_version_id") REFERENCES "cv_versions"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_question_sets_source_id" FOREIGN KEY ("source_question_set_id") REFERENCES "question_sets"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_question_sets_approved_by" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_question_sets_version" CHECK ("version" >= 1),
        CONSTRAINT "CHK_question_sets_gen_version" CHECK ("generation_version" >= 1),
        CONSTRAINT "CHK_question_sets_cv_profile_version" CHECK ("cv_profile_version" >= 1),
        CONSTRAINT "CHK_question_sets_job_version" CHECK ("job_version" >= 1)
      )`,
    );

    // 3. Tạo Indexes cho question_sets
    await queryRunner.query(
      `CREATE INDEX "IDX_question_sets_application_created" ON "question_sets" ("application_id", "created_at" DESC, "id" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_question_sets_owner_created" ON "question_sets" ("owner_id", "created_at" DESC, "id" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_question_sets_status_created" ON "question_sets" ("status", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_question_sets_deleted_at" ON "question_sets" ("deleted_at")`,
    );

    // 4. Tạo bảng question_set_items
    await queryRunner.query(
      `CREATE TABLE "question_set_items" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "question_set_id" uuid NOT NULL,
        "position" integer NOT NULL,
        "text" text NOT NULL,
        "source" "public"."question_set_items_source_enum" NOT NULL DEFAULT 'manual',
        "competency" character varying(150),
        "evaluation_criterion_id" character varying(100),
        "difficulty" "public"."question_set_items_difficulty_enum" NOT NULL DEFAULT 'intermediate',
        "allow_follow_up" boolean NOT NULL DEFAULT true,
        "max_follow_ups" integer NOT NULL DEFAULT 1,
        "evidence_refs" jsonb,
        "review_notes" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_question_set_items_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_question_set_items_set_id" FOREIGN KEY ("question_set_id") REFERENCES "question_sets"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_question_set_items_position" UNIQUE ("question_set_id", "position"),
        CONSTRAINT "CHK_question_set_items_position" CHECK ("position" >= 1 AND "position" <= 12),
        CONSTRAINT "CHK_question_set_items_max_follow_ups" CHECK ("max_follow_ups" >= 0 AND "max_follow_ups" <= 2)
      )`,
    );

    // 5. Tạo Index cho question_set_items
    await queryRunner.query(
      `CREATE INDEX "IDX_question_set_items_set_position" ON "question_set_items" ("question_set_id", "position")`,
    );

    // 6. Seed các permissions cho Question Sets Module
    await queryRunner.query(
      `INSERT INTO "permissions" ("id", "key", "name", "resource", "action", "isSystem", "isActive") VALUES
        ('10000000-0000-4000-8000-000000000033', 'question-sets:read', 'Read question sets', 'question-sets', 'read', true, true),
        ('10000000-0000-4000-8000-000000000034', 'question-sets:create', 'Create question sets', 'question-sets', 'create', true, true),
        ('10000000-0000-4000-8000-000000000035', 'question-sets:update', 'Update question set items', 'question-sets', 'update', true, true),
        ('10000000-0000-4000-8000-000000000036', 'question-sets:approve', 'Approve question sets', 'question-sets', 'approve', true, true),
        ('10000000-0000-4000-8000-000000000037', 'question-sets:manage', 'Manage all question sets', 'question-sets', 'manage', true, true)
      ON CONFLICT ("key") DO NOTHING`,
    );

    // 7. Gán toàn bộ 5 permissions cho role 'admin'
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT '00000000-0000-4000-8000-000000000001', "id"
      FROM "permissions"
      WHERE "key" IN (
        'question-sets:read', 'question-sets:create', 'question-sets:update', 'question-sets:approve', 'question-sets:manage'
      )
      ON CONFLICT ("role_id", "permission_id") DO NOTHING`,
    );

    // 8. Gán 4 permissions cho role 'hr' (không có question-sets:manage)
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT '00000000-0000-4000-8000-000000000002', "id"
      FROM "permissions"
      WHERE "key" IN (
        'question-sets:read', 'question-sets:create', 'question-sets:update', 'question-sets:approve'
      )
      ON CONFLICT ("role_id", "permission_id") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Thu hồi role_permissions liên quan đến question-sets
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "permission_id" IN (
        SELECT "id" FROM "permissions" WHERE "key" LIKE 'question-sets:%'
      )`,
    );

    // 2. Xóa permissions question-sets
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "key" LIKE 'question-sets:%'`,
    );

    // 3. Xóa indexes và bảng question_set_items
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_question_set_items_set_position"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "question_set_items"`);

    // 4. Xóa indexes và bảng question_sets
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_question_sets_deleted_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_question_sets_status_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_question_sets_owner_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_question_sets_application_created"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "question_sets"`);

    // 5. Xóa các enum types
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."question_set_items_difficulty_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."question_set_items_source_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."question_sets_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."question_sets_mode_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."question_sets_language_enum"`,
    );
  }
}
