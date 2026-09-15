import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInterviewRuntime1788680000000 implements MigrationInterface {
  name = 'CreateInterviewRuntime1788680000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Tạo các ENUM types cho interview-runtime
    await queryRunner.query(
      `CREATE TYPE "public"."interview_sessions_status_enum" AS ENUM('in_progress', 'completed', 'expired', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."interview_sessions_runtime_state_enum" AS ENUM('awaiting_answer', 'advancing', 'ready_to_finish', 'closed')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."interview_sessions_end_reason_enum" AS ENUM('all_questions_answered', 'submitted_early', 'deadline_reached', 'hr_cancelled')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."interview_turns_kind_enum" AS ENUM('main', 'follow_up')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."interview_turns_status_enum" AS ENUM('open', 'answered', 'skipped', 'closed_unanswered')`,
    );

    // 2. Tạo bảng interview_sessions (chưa thêm FK current_turn_id để tránh vòng lặp)
    await queryRunner.query(
      `CREATE TABLE "interview_sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "interview_id" uuid NOT NULL,
        "status" "public"."interview_sessions_status_enum" NOT NULL DEFAULT 'in_progress',
        "runtime_state" "public"."interview_sessions_runtime_state_enum" NOT NULL DEFAULT 'awaiting_answer',
        "started_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "deadline_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "ended_at" TIMESTAMP WITH TIME ZONE,
        "end_reason" "public"."interview_sessions_end_reason_enum",
        "current_turn_id" uuid,
        "follow_ups_used" integer NOT NULL DEFAULT 0,
        "version" integer NOT NULL DEFAULT 1,
        "advance_deadline_at" TIMESTAMP WITH TIME ZONE,
        "consent_version" character varying(50) NOT NULL,
        "consented_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_interview_sessions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_interview_sessions_interview_id" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE RESTRICT,
        CONSTRAINT "UQ_interview_sessions_interview_id" UNIQUE ("interview_id"),
        CONSTRAINT "CHK_interview_sessions_follow_ups" CHECK ("follow_ups_used" >= 0),
        CONSTRAINT "CHK_interview_sessions_version" CHECK ("version" >= 1)
      )`,
    );

    // Partial Index cho deadline_at của session đang in_progress (cho sweeper sau này)
    await queryRunner.query(
      `CREATE INDEX "IDX_interview_sessions_active_deadline" ON "interview_sessions" ("deadline_at") WHERE status = 'in_progress'`,
    );

    // 3. Tạo bảng interview_turns
    await queryRunner.query(
      `CREATE TABLE "interview_turns" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "session_id" uuid NOT NULL,
        "root_question_id" uuid NOT NULL,
        "parent_turn_id" uuid,
        "sequence_no" integer NOT NULL,
        "kind" "public"."interview_turns_kind_enum" NOT NULL DEFAULT 'main',
        "follow_up_index" integer NOT NULL DEFAULT 0,
        "text" text NOT NULL,
        "status" "public"."interview_turns_status_enum" NOT NULL DEFAULT 'open',
        "presented_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "closed_at" TIMESTAMP WITH TIME ZONE,
        "ai_run_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_interview_turns_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_interview_turns_session_id" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_interview_turns_root_question_id" FOREIGN KEY ("root_question_id") REFERENCES "interview_questions"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_interview_turns_parent_turn_id" FOREIGN KEY ("parent_turn_id") REFERENCES "interview_turns"("id") ON DELETE SET NULL,
        CONSTRAINT "UQ_interview_turns_session_sequence" UNIQUE ("session_id", "sequence_no"),
        CONSTRAINT "UQ_interview_turns_session_root_follow_up" UNIQUE ("session_id", "root_question_id", "follow_up_index"),
        CONSTRAINT "CHK_interview_turns_sequence_no" CHECK ("sequence_no" >= 1),
        CONSTRAINT "CHK_interview_turns_follow_up_index" CHECK ("follow_up_index" >= 0)
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_interview_turns_session_sequence" ON "interview_turns" ("session_id", "sequence_no")`,
    );

    // Partial Unique Index: Mỗi session tại 1 thời điểm chỉ được có tối đa 1 turn ở status 'open'
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_interview_turns_single_open" ON "interview_turns" ("session_id") WHERE status = 'open'`,
    );

    // 4. Thêm foreign key current_turn_id vào interview_sessions sau khi bảng turns đã tồn tại
    await queryRunner.query(
      `ALTER TABLE "interview_sessions" ADD CONSTRAINT "FK_interview_sessions_current_turn_id" FOREIGN KEY ("current_turn_id") REFERENCES "interview_turns"("id") ON DELETE SET NULL`,
    );

    // 5. Tạo bảng answers (không có answer_drafts)
    await queryRunner.query(
      `CREATE TABLE "answers" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "turn_id" uuid NOT NULL,
        "text" text,
        "is_skipped" boolean NOT NULL DEFAULT false,
        "submitted_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "client_request_id" character varying(255),
        "content_hash" character(64) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_answers_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_answers_turn_id" FOREIGN KEY ("turn_id") REFERENCES "interview_turns"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_answers_turn_id" UNIQUE ("turn_id"),
        CONSTRAINT "CHK_answers_skip_text_integrity" CHECK (
          ("is_skipped" = true AND "text" IS NULL) OR
          ("is_skipped" = false AND "text" IS NOT NULL AND length(trim("text")) >= 1 AND length(trim("text")) <= 10000)
        )
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "answers"`);
    await queryRunner.query(
      `ALTER TABLE "interview_sessions" DROP CONSTRAINT "FK_interview_sessions_current_turn_id"`,
    );
    await queryRunner.query(`DROP TABLE "interview_turns"`);
    await queryRunner.query(`DROP TABLE "interview_sessions"`);
    await queryRunner.query(`DROP TYPE "public"."interview_turns_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."interview_turns_kind_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."interview_sessions_end_reason_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."interview_sessions_runtime_state_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."interview_sessions_status_enum"`,
    );
  }
}
