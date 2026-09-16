import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLoginAttemptsAndNotificationColumns1788690000000 implements MigrationInterface {
  name = 'CreateLoginAttemptsAndNotificationColumns1788690000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Tạo bảng login_attempts thay thế Redis chống brute force
    await queryRunner.query(
      `CREATE TABLE "login_attempts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "identifier_hash" character varying(64) NOT NULL,
        "failed_count" integer NOT NULL DEFAULT 0,
        "locked_until" TIMESTAMP WITH TIME ZONE,
        "last_attempt_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_login_attempts_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_login_attempts_identifier_hash" UNIQUE ("identifier_hash")
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_login_attempts_locked_until" ON "login_attempts" ("locked_until")`,
    );

    // 2. Thêm cột last_attempt_at cho bảng notifications nếu chưa có
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "last_attempt_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN IF EXISTS "last_attempt_at"`,
    );
    await queryRunner.query(`DROP TABLE "login_attempts"`);
  }
}
