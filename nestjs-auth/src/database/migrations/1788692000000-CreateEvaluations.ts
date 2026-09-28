import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEvaluations1788692000000 implements MigrationInterface {
  name = 'CreateEvaluations1788692000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Tạo bảng evaluations
    await queryRunner.query(
      `CREATE TABLE "evaluations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "owner_id" uuid NOT NULL,
        "interview_id" uuid NOT NULL,
        "session_id" uuid NOT NULL,
        "type" character varying(30) NOT NULL,
        "revision" integer NOT NULL DEFAULT 1,
        "schema_version" integer NOT NULL DEFAULT 1,
        "content" jsonb NOT NULL,
        "ai_run_id" uuid,
        "input_hash" character varying(64),
        "created_by" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_evaluations_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_evaluations_owner_id" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_evaluations_interview_id" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_evaluations_session_id" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_evaluations_ai_run_id" FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE SET NULL,
        CONSTRAINT "uq_evaluations_interview_type_revision" UNIQUE ("interview_id", "type", "revision")
      )`,
    );

    // 2. Tạo Indexes
    await queryRunner.query(
      `CREATE INDEX "idx_evaluations_owner_interview" ON "evaluations" ("owner_id", "interview_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_evaluations_interview_type" ON "evaluations" ("interview_id", "type", "created_at" DESC)`,
    );

    // 3. Seed permissions cho reviews:read và reviews:create
    await queryRunner.query(
      `INSERT INTO "permissions" ("id", "key", "name", "description", "resource", "action", "isSystem", "isActive")
      VALUES
        ('10000000-0000-4000-8000-000000000050', 'reviews:read', 'Read interview reviews', 'Read interview reviews and evaluations', 'reviews', 'read', true, true),
        ('10000000-0000-4000-8000-000000000051', 'reviews:create', 'Create interview reviews', 'Create reviews and regenerate AI summary', 'reviews', 'create', true, true)
      ON CONFLICT ("key") DO NOTHING`,
    );

    // 4. Gán permissions cho role 'admin'
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT '00000000-0000-4000-8000-000000000001', "id"
      FROM "permissions"
      WHERE "key" IN ('reviews:read', 'reviews:create')
      ON CONFLICT ("role_id", "permission_id") DO NOTHING`,
    );

    // 5. Gán permissions cho role 'hr'
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT '00000000-0000-4000-8000-000000000002', "id"
      FROM "permissions"
      WHERE "key" IN ('reviews:read', 'reviews:create')
      ON CONFLICT ("role_id", "permission_id") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Thu hồi permissions
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "permission_id" IN (
        SELECT "id" FROM "permissions" WHERE "key" LIKE 'reviews:%'
      )`,
    );
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "key" LIKE 'reviews:%'`,
    );

    // 2. Drop table
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_evaluations_interview_type"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_evaluations_owner_interview"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "evaluations"`);
  }
}
