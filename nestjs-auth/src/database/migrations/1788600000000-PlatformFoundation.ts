import { MigrationInterface, QueryRunner } from 'typeorm';

export class PlatformFoundation1788600000000 implements MigrationInterface {
  name = 'PlatformFoundation1788600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Rename table authorization_audit_logs -> audit_logs & rename columns
    await queryRunner.query(
      `ALTER TABLE "authorization_audit_logs" RENAME TO "audit_logs"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" RENAME COLUMN "actorId" TO "actor_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" RENAME COLUMN "targetType" TO "target_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" RENAME COLUMN "targetId" TO "target_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" RENAME COLUMN "createdAt" TO "created_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ALTER COLUMN "created_at" TYPE TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD COLUMN "actor_type" character varying(50) NOT NULL DEFAULT 'user'`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD COLUMN "owner_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD COLUMN "request_id" character varying(100)`,
    );

    // Drop old indexes and create new snake_case indexes
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_504c9c1afa64c2f76a1888b38d"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_b9d473ea95588fa38ed5b89a74"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_ec62e411dfa134fbd35d051cf1"`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_actor_id" ON "audit_logs" ("actor_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_action" ON "audit_logs" ("action")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_target_id" ON "audit_logs" ("target_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_owner_id" ON "audit_logs" ("owner_id")`,
    );

    // 2. Create table idempotency_keys
    await queryRunner.query(
      `CREATE TABLE "idempotency_keys" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "actor_scope" character varying(120) NOT NULL,
        "route" character varying(255) NOT NULL,
        "key" character varying(255) NOT NULL,
        "request_hash" character varying(64) NOT NULL,
        "response_status" integer,
        "response_body" jsonb,
        "state" character varying(20) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_idempotency_actor_route_key" UNIQUE ("actor_scope", "route", "key"),
        CONSTRAINT "PK_idempotency_keys_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_idempotency_keys_expires_at" ON "idempotency_keys" ("expires_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_idempotency_keys_expires_at"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "idempotency_keys"`);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_audit_logs_owner_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_audit_logs_target_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_audit_logs_action"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_audit_logs_actor_id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "request_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "owner_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "actor_type"`,
    );

    await queryRunner.query(
      `ALTER TABLE "audit_logs" RENAME COLUMN "actor_id" TO "actorId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" RENAME COLUMN "target_type" TO "targetType"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" RENAME COLUMN "target_id" TO "targetId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" RENAME COLUMN "created_at" TO "createdAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" RENAME TO "authorization_audit_logs"`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_504c9c1afa64c2f76a1888b38d" ON "authorization_audit_logs" ("actorId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b9d473ea95588fa38ed5b89a74" ON "authorization_audit_logs" ("action")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ec62e411dfa134fbd35d051cf1" ON "authorization_audit_logs" ("targetId")`,
    );
  }
}
