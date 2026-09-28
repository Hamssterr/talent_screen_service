import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAiRuns1788691000000 implements MigrationInterface {
  name = 'CreateAiRuns1788691000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Tạo các ENUM types cho ai_runs
    await queryRunner.query(
      `CREATE TYPE "public"."ai_runs_task_enum" AS ENUM('profile_extraction', 'question_generation', 'follow_up', 'interview_summary')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ai_runs_status_enum" AS ENUM('processing', 'succeeded', 'failed', 'superseded')`,
    );

    // 2. Tạo bảng ai_runs
    await queryRunner.query(
      `CREATE TABLE "ai_runs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "task" "public"."ai_runs_task_enum" NOT NULL,
        "provider" character varying(50) NOT NULL DEFAULT 'gemini',
        "model" character varying(100) NOT NULL,
        "aggregate_type" character varying(50) NOT NULL,
        "aggregate_id" uuid NOT NULL,
        "prompt_version" character varying(50) NOT NULL,
        "schema_version" character varying(50) NOT NULL,
        "input_hash" character varying(64) NOT NULL,
        "status" "public"."ai_runs_status_enum" NOT NULL DEFAULT 'processing',
        "started_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "latency_ms" integer,
        "input_tokens" integer,
        "output_tokens" integer,
        "error_code" character varying(100),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_runs_id" PRIMARY KEY ("id")
      )`,
    );

    // 3. Tạo Indexes
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_runs_aggregate" ON "ai_runs" ("aggregate_type", "aggregate_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_runs_task_status" ON "ai_runs" ("task", "status", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_ai_runs_task_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ai_runs_aggregate"`);
    await queryRunner.query(`DROP TABLE "ai_runs"`);
    await queryRunner.query(`DROP TYPE "public"."ai_runs_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."ai_runs_task_enum"`);
  }
}
