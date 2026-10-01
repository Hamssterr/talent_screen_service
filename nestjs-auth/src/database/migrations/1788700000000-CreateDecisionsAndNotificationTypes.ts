import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDecisionsAndNotificationTypes1788700000000 implements MigrationInterface {
  name = 'CreateDecisionsAndNotificationTypes1788700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Mở rộng ENUM notifications_type_enum thêm 2 giá trị mới cho decisions
    await queryRunner.query(
      `ALTER TYPE "public"."notifications_type_enum" ADD VALUE IF NOT EXISTS 'application_approved'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."notifications_type_enum" ADD VALUE IF NOT EXISTS 'application_rejected'`,
    );

    // 2. Tạo Enum outcome cho application_decisions
    await queryRunner.query(
      `CREATE TYPE "public"."application_decisions_outcome_enum" AS ENUM('approved', 'rejected')`,
    );

    // 3. Tạo bảng application_decisions
    await queryRunner.query(
      `CREATE TABLE "application_decisions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "owner_id" uuid NOT NULL,
        "application_id" uuid NOT NULL,
        "basis_interview_id" uuid NOT NULL,
        "basis_session_id" uuid NOT NULL,
        "basis_hr_review_id" uuid NOT NULL,
        "outcome" "public"."application_decisions_outcome_enum" NOT NULL,
        "internal_reason" text NOT NULL,
        "candidate_message" text,
        "notify_candidate" boolean NOT NULL DEFAULT false,
        "previous_status" "public"."applications_status_enum" NOT NULL,
        "decided_by" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_application_decisions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_application_decisions_application_id" UNIQUE ("application_id"),
        CONSTRAINT "FK_application_decisions_owner_id" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_application_decisions_application_id" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_application_decisions_basis_interview_id" FOREIGN KEY ("basis_interview_id") REFERENCES "interviews"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_application_decisions_basis_session_id" FOREIGN KEY ("basis_session_id") REFERENCES "interview_sessions"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_application_decisions_basis_hr_review_id" FOREIGN KEY ("basis_hr_review_id") REFERENCES "evaluations"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_application_decisions_decided_by" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE RESTRICT
      )`,
    );

    // 4. Tạo Indexes cho application_decisions
    await queryRunner.query(
      `CREATE INDEX "idx_application_decisions_owner_created" ON "application_decisions" ("owner_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_application_decisions_basis_interview" ON "application_decisions" ("basis_interview_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_application_decisions_basis_hr_review" ON "application_decisions" ("basis_hr_review_id")`,
    );

    // 5. Seed permissions cho decisions:read, decisions:create, decisions:manage
    await queryRunner.query(
      `INSERT INTO "permissions" ("id", "key", "name", "description", "resource", "action", "isSystem", "isActive")
      VALUES
        ('10000000-0000-4000-8000-000000000060', 'decisions:read', 'Read application decisions', 'Read application decisions and review basis', 'decisions', 'read', true, true),
        ('10000000-0000-4000-8000-000000000061', 'decisions:create', 'Create application decisions', 'Create final decisions for applications', 'decisions', 'create', true, true),
        ('10000000-0000-4000-8000-000000000062', 'decisions:manage', 'Manage application decisions', 'Manage application decisions and override settings', 'decisions', 'manage', true, true)
      ON CONFLICT ("key") DO NOTHING`,
    );

    // 6. Gán permissions cho role 'admin'
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT '00000000-0000-4000-8000-000000000001', "id"
      FROM "permissions"
      WHERE "key" IN ('decisions:read', 'decisions:create', 'decisions:manage')
      ON CONFLICT ("role_id", "permission_id") DO NOTHING`,
    );

    // 7. Gán permissions cho role 'hr'
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT '00000000-0000-4000-8000-000000000002', "id"
      FROM "permissions"
      WHERE "key" IN ('decisions:read', 'decisions:create')
      ON CONFLICT ("role_id", "permission_id") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Thu hồi permissions
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "permission_id" IN (
        SELECT "id" FROM "permissions" WHERE "key" LIKE 'decisions:%'
      )`,
    );
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "key" LIKE 'decisions:%'`,
    );

    // 2. Drop bảng và indexes
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_application_decisions_basis_hr_review"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_application_decisions_basis_interview"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_application_decisions_owner_created"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "application_decisions"`);

    // 3. Drop Enum outcome
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."application_decisions_outcome_enum"`,
    );
  }
}
