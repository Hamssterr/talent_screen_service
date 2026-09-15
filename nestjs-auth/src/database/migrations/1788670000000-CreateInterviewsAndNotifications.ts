import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInterviewsAndNotifications1788670000000 implements MigrationInterface {
  name = 'CreateInterviewsAndNotifications1788670000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Tạo các ENUM types cho interviews và notifications
    await queryRunner.query(
      `CREATE TYPE "public"."interviews_status_enum" AS ENUM('invited', 'in_progress', 'completed', 'expired', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."interviews_language_enum" AS ENUM('vi', 'en')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notifications_status_enum" AS ENUM('pending', 'sending', 'accepted', 'delivered', 'failed', 'unknown', 'suppressed')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notifications_type_enum" AS ENUM('interview_invitation', 'interview_cancelled')`,
    );

    // 2. Tạo bảng interviews
    await queryRunner.query(
      `CREATE TABLE "interviews" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "owner_id" uuid NOT NULL,
        "application_id" uuid NOT NULL,
        "question_set_id" uuid NOT NULL,
        "cv_version_id" uuid NOT NULL,
        "round_no" integer NOT NULL DEFAULT 1,
        "status" "public"."interviews_status_enum" NOT NULL DEFAULT 'invited',
        "invitation_expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "duration_minutes" integer NOT NULL,
        "version" integer NOT NULL DEFAULT 1,
        "invitation_version" integer NOT NULL DEFAULT 1,
        "language" "public"."interviews_language_enum" NOT NULL DEFAULT 'vi',
        "max_follow_ups_total" integer NOT NULL DEFAULT 0,
        "profile_snapshot" jsonb NOT NULL,
        "job_snapshot" jsonb NOT NULL,
        "cancel_reason" text,
        "cancelled_at" TIMESTAMP WITH TIME ZONE,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_interviews_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_interviews_owner_id" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_interviews_application_id" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_interviews_question_set_id" FOREIGN KEY ("question_set_id") REFERENCES "question_sets"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_interviews_cv_version_id" FOREIGN KEY ("cv_version_id") REFERENCES "cv_versions"("id") ON DELETE RESTRICT,
        CONSTRAINT "UQ_interviews_app_round" UNIQUE ("application_id", "round_no"),
        CONSTRAINT "CHK_interviews_round_no" CHECK ("round_no" >= 1),
        CONSTRAINT "CHK_interviews_duration" CHECK ("duration_minutes" >= 10 AND "duration_minutes" <= 90),
        CONSTRAINT "CHK_interviews_version" CHECK ("version" >= 1),
        CONSTRAINT "CHK_interviews_invitation_version" CHECK ("invitation_version" >= 1),
        CONSTRAINT "CHK_interviews_max_follow_ups" CHECK ("max_follow_ups_total" >= 0)
      )`,
    );

    // 3. Tạo Indexes cho interviews, đặc biệt là Partial Unique Index chỉ 1 phỏng vấn mở / Application
    await queryRunner.query(
      `CREATE INDEX "IDX_interviews_application_created" ON "interviews" ("application_id", "created_at" DESC, "id" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_interviews_owner_created" ON "interviews" ("owner_id", "created_at" DESC, "id" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_interviews_status_created" ON "interviews" ("status", "created_at")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_interviews_active_per_application" ON "interviews" ("application_id") WHERE "status" IN ('invited', 'in_progress')`,
    );

    // 4. Tạo bảng interview_questions
    await queryRunner.query(
      `CREATE TABLE "interview_questions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "interview_id" uuid NOT NULL,
        "source_question_id" uuid,
        "position" integer NOT NULL,
        "text" text NOT NULL,
        "source" "public"."question_set_items_source_enum" NOT NULL DEFAULT 'manual',
        "competency" character varying(150),
        "evaluation_criterion_id" character varying(100),
        "difficulty" "public"."question_set_items_difficulty_enum" NOT NULL DEFAULT 'intermediate',
        "allow_follow_up" boolean NOT NULL DEFAULT true,
        "max_follow_ups" integer NOT NULL DEFAULT 1,
        "evidence_refs" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_interview_questions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_interview_questions_interview_id" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_interview_questions_position" UNIQUE ("interview_id", "position"),
        CONSTRAINT "CHK_interview_questions_position" CHECK ("position" >= 1 AND "position" <= 12),
        CONSTRAINT "CHK_interview_questions_max_follow_ups" CHECK ("max_follow_ups" >= 0 AND "max_follow_ups" <= 2)
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_interview_questions_set_position" ON "interview_questions" ("interview_id", "position")`,
    );

    // 5. Tạo bảng invitations
    await queryRunner.query(
      `CREATE TABLE "invitations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "interview_id" uuid NOT NULL,
        "invitation_version" integer NOT NULL DEFAULT 1,
        "token_hash" character(64) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "last_exchanged_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_invitations_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_invitations_interview_id" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_invitations_token_hash" UNIQUE ("token_hash"),
        CONSTRAINT "UQ_invitations_interview_version" UNIQUE ("interview_id", "invitation_version")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_invitations_interview_version" ON "invitations" ("interview_id", "invitation_version")`,
    );

    // 6. Tạo bảng interview_access_credentials
    await queryRunner.query(
      `CREATE TABLE "interview_access_credentials" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "invitation_id" uuid NOT NULL,
        "token_hash" character(64) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "last_seen_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_interview_access_credentials_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_interview_access_credentials_inv_id" FOREIGN KEY ("invitation_id") REFERENCES "invitations"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_interview_access_credentials_token_hash" UNIQUE ("token_hash")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_interview_access_credentials_inv_created" ON "interview_access_credentials" ("invitation_id", "created_at")`,
    );

    // 7. Tạo bảng notifications
    await queryRunner.query(
      `CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "owner_id" uuid NOT NULL,
        "interview_id" uuid,
        "invitation_version" integer,
        "type" "public"."notifications_type_enum" NOT NULL,
        "recipient" character varying(255) NOT NULL,
        "status" "public"."notifications_status_enum" NOT NULL DEFAULT 'pending',
        "dedupe_key" character varying(255) NOT NULL,
        "provider_message_id" character varying(255),
        "attempts" integer NOT NULL DEFAULT 0,
        "next_attempt_at" TIMESTAMP WITH TIME ZONE,
        "accepted_at" TIMESTAMP WITH TIME ZONE,
        "error_code" character varying(100),
        "encrypted_payload" text,
        "payload_expires_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notifications_owner_id" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_notifications_interview_id" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE SET NULL,
        CONSTRAINT "UQ_notifications_dedupe_key" UNIQUE ("dedupe_key")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_interview_created" ON "notifications" ("interview_id", "created_at" DESC, "id" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_owner_created" ON "notifications" ("owner_id", "created_at" DESC, "id" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_status_next_attempt" ON "notifications" ("status", "next_attempt_at")`,
    );

    // 8. Seed permissions cho Interviews Module
    await queryRunner.query(
      `INSERT INTO "permissions" ("id", "key", "name", "resource", "action", "isSystem", "isActive") VALUES
        ('10000000-0000-4000-8000-000000000038', 'interviews:read', 'Read interviews', 'interviews', 'read', true, true),
        ('10000000-0000-4000-8000-000000000039', 'interviews:create', 'Create interviews and invitations', 'interviews', 'create', true, true),
        ('10000000-0000-4000-8000-000000000040', 'interviews:revoke', 'Revoke interviews and invitations', 'interviews', 'revoke', true, true),
        ('10000000-0000-4000-8000-000000000041', 'interviews:resend', 'Resend interview invitations', 'interviews', 'resend', true, true),
        ('10000000-0000-4000-8000-000000000042', 'interviews:manage', 'Manage all interviews', 'interviews', 'manage', true, true)
      ON CONFLICT ("key") DO NOTHING`,
    );

    // 9. Gán toàn bộ 5 permissions cho role 'admin'
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT '00000000-0000-4000-8000-000000000001', "id"
      FROM "permissions"
      WHERE "key" IN (
        'interviews:read', 'interviews:create', 'interviews:revoke', 'interviews:resend', 'interviews:manage'
      )
      ON CONFLICT ("role_id", "permission_id") DO NOTHING`,
    );

    // 10. Gán 4 permissions cho role 'hr' (không có interviews:manage)
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT '00000000-0000-4000-8000-000000000002', "id"
      FROM "permissions"
      WHERE "key" IN (
        'interviews:read', 'interviews:create', 'interviews:revoke', 'interviews:resend'
      )
      ON CONFLICT ("role_id", "permission_id") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Thu hồi role_permissions liên quan đến interviews
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "permission_id" IN (
        SELECT "id" FROM "permissions" WHERE "key" LIKE 'interviews:%'
      )`,
    );

    // 2. Xóa permissions interviews
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "key" LIKE 'interviews:%'`,
    );

    // 3. Xóa các bảng
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "interview_access_credentials"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "invitations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "interview_questions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "interviews"`);

    // 4. Xóa enum types
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."notifications_type_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."notifications_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."interviews_language_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."interviews_status_enum"`,
    );
  }
}
