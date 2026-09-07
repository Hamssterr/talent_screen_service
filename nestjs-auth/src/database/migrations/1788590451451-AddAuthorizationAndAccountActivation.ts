import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuthorizationAndAccountActivation1788590451451 implements MigrationInterface {
  name = 'AddAuthorizationAndAccountActivation1788590451451';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TYPE "public"."action_tokens_type_enum" AS ENUM('EMAIL_VERIFICATION', 'PASSWORD_RESET', 'ACCOUNT_ACTIVATION')`,
    );
    await queryRunner.query(
      `CREATE TABLE "action_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "type" "public"."action_tokens_type_enum" NOT NULL, "tokenHash" character varying NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "usedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "user_id" uuid, CONSTRAINT "UQ_fad96a937dbbbfc18e568815ec6" UNIQUE ("tokenHash"), CONSTRAINT "PK_d29a2a18dc1b6b8abe2a151bea0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fad96a937dbbbfc18e568815ec" ON "action_tokens"  ("tokenHash") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e9a3f1f8966f1cae54c487c0eb" ON "action_tokens"  ("user_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "permissions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "key" character varying(120) NOT NULL, "name" character varying(160) NOT NULL, "description" text, "resource" character varying(80) NOT NULL, "action" character varying(80) NOT NULL, "isSystem" boolean NOT NULL DEFAULT true, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_920331560282b8bd21bb02290df" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_017943867ed5ceef9c03edd974" ON "permissions"  ("key") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_89456a09b598ce8915c702c528" ON "permissions"  ("resource") `,
    );
    await queryRunner.query(
      `CREATE TABLE "role_permissions" ("role_id" uuid NOT NULL, "permission_id" uuid NOT NULL, "granted_by" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_25d24010f53bb80b78e412c9656" PRIMARY KEY ("role_id", "permission_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "roles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "key" character varying(80) NOT NULL, "name" character varying(120) NOT NULL, "description" text, "isSystem" boolean NOT NULL DEFAULT false, "isActive" boolean NOT NULL DEFAULT true, "version" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a87cf0659c3ac379b339acf36a" ON "roles"  ("key") `,
    );
    await queryRunner.query(
      `CREATE TABLE "user_roles" ("user_id" uuid NOT NULL, "role_id" uuid NOT NULL, "assigned_by" uuid, "expiresAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_23ed6f04fe43066df08379fd034" PRIMARY KEY ("user_id", "role_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7129d2dc499f9f4c1e0c81cc9f" ON "user_roles"  ("expiresAt") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_provider_enum" AS ENUM('local', 'google')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('user', 'admin')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_status_enum" AS ENUM('pending', 'active', 'inactive', 'blocked')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "email" character varying NOT NULL, "phoneNumber" character varying, "passwordHash" character varying, "provider" "public"."users_provider_enum" NOT NULL DEFAULT 'local', "googleId" character varying, "role" "public"."users_role_enum" NOT NULL DEFAULT 'user', "status" "public"."users_status_enum" NOT NULL DEFAULT 'pending', "isEmailVerified" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_51b8b26ac168fbe7d6f5653e6c" ON "users"  ("name") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users"  ("email") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4305aedaa7aed08419da6a29ec" ON "users"  ("provider") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_f382af58ab36057334fb262efd" ON "users"  ("googleId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tokenHash" character varying NOT NULL, "userId" uuid NOT NULL, "familyId" character varying NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "revokedAt" TIMESTAMP WITH TIME ZONE, "lastUsedAt" TIMESTAMP WITH TIME ZONE, "userAgent" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c25bc63d248ca90e8dcc1d92d0" ON "refresh_tokens"  ("tokenHash") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_610102b60fea1455310ccd299d" ON "refresh_tokens"  ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_40e9a8b923a1b3fb4429a5c624" ON "refresh_tokens"  ("familyId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "authorization_audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actorId" uuid, "action" character varying(100) NOT NULL, "targetType" character varying(80) NOT NULL, "targetId" uuid, "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1b5bfe49a0847e9281003c651e8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_504c9c1afa64c2f76a1888b38d" ON "authorization_audit_logs"  ("actorId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b9d473ea95588fa38ed5b89a74" ON "authorization_audit_logs"  ("action") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ec62e411dfa134fbd35d051cf1" ON "authorization_audit_logs"  ("targetId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "action_tokens" ADD CONSTRAINT "FK_e9a3f1f8966f1cae54c487c0eb4" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_178199805b901ccd220ab7740ec" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_17022daf3f885f7d35423e9971e" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_a5afd4e09e8fc0646edb1d79933" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_roles" ADD CONSTRAINT "FK_87b8888186ca9769c960e926870" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_roles" ADD CONSTRAINT "FK_b23c65e50a758245a33ee35fda1" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_roles" ADD CONSTRAINT "FK_6de6fefffe4a6d17de747bf8b9d" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_610102b60fea1455310ccd299de" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`INSERT INTO "roles" ("id", "key", "name", "description", "isSystem", "isActive", "version") VALUES
          ('00000000-0000-4000-8000-000000000001', 'admin', 'Administrator', 'Quản trị hệ thống và phân quyền', true, true, 1),
          ('00000000-0000-4000-8000-000000000002', 'hr', 'Human Resources', 'Quản lý quy trình tuyển dụng', true, true, 1),
          ('00000000-0000-4000-8000-000000000003', 'user', 'User', 'Tài khoản nội bộ cơ bản', true, true, 1)
          ON CONFLICT ("key") DO NOTHING`);
    await queryRunner.query(`INSERT INTO "permissions" ("id", "key", "name", "resource", "action", "isSystem", "isActive") VALUES
          ('10000000-0000-4000-8000-000000000001', 'users:read', 'Read users', 'users', 'read', true, true),
          ('10000000-0000-4000-8000-000000000002', 'users:invite', 'Invite users', 'users', 'invite', true, true),
          ('10000000-0000-4000-8000-000000000003', 'users:update', 'Update users', 'users', 'update', true, true),
          ('10000000-0000-4000-8000-000000000004', 'users:disable', 'Disable users', 'users', 'disable', true, true),
          ('10000000-0000-4000-8000-000000000005', 'roles:read', 'Read roles', 'roles', 'read', true, true),
          ('10000000-0000-4000-8000-000000000006', 'roles:create', 'Create roles', 'roles', 'create', true, true),
          ('10000000-0000-4000-8000-000000000007', 'roles:update', 'Update roles', 'roles', 'update', true, true),
          ('10000000-0000-4000-8000-000000000008', 'roles:disable', 'Disable roles', 'roles', 'disable', true, true),
          ('10000000-0000-4000-8000-000000000009', 'permissions:read', 'Read permissions', 'permissions', 'read', true, true),
          ('10000000-0000-4000-8000-000000000010', 'role-permissions:manage', 'Manage role permissions', 'role-permissions', 'manage', true, true),
          ('10000000-0000-4000-8000-000000000011', 'user-roles:manage', 'Manage user roles', 'user-roles', 'manage', true, true),
          ('10000000-0000-4000-8000-000000000012', 'audit:read', 'Read authorization audit', 'audit', 'read', true, true)
          ON CONFLICT ("key") DO NOTHING`);
    await queryRunner.query(`INSERT INTO "role_permissions" ("role_id", "permission_id")
          SELECT '00000000-0000-4000-8000-000000000001', "id" FROM "permissions"
          ON CONFLICT ("role_id", "permission_id") DO NOTHING`);
    await queryRunner.query(`INSERT INTO "user_roles" ("user_id", "role_id")
          SELECT "id", CASE WHEN "role" = 'admin'
            THEN '00000000-0000-4000-8000-000000000001'::uuid
            ELSE '00000000-0000-4000-8000-000000000003'::uuid END
          FROM "users"
          ON CONFLICT ("user_id", "role_id") DO NOTHING`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_610102b60fea1455310ccd299de"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_roles" DROP CONSTRAINT "FK_6de6fefffe4a6d17de747bf8b9d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_roles" DROP CONSTRAINT "FK_b23c65e50a758245a33ee35fda1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_roles" DROP CONSTRAINT "FK_87b8888186ca9769c960e926870"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_a5afd4e09e8fc0646edb1d79933"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_17022daf3f885f7d35423e9971e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_178199805b901ccd220ab7740ec"`,
    );
    await queryRunner.query(
      `ALTER TABLE "action_tokens" DROP CONSTRAINT "FK_e9a3f1f8966f1cae54c487c0eb4"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ec62e411dfa134fbd35d051cf1"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b9d473ea95588fa38ed5b89a74"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_504c9c1afa64c2f76a1888b38d"`,
    );
    await queryRunner.query(`DROP TABLE "authorization_audit_logs"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_40e9a8b923a1b3fb4429a5c624"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_610102b60fea1455310ccd299d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c25bc63d248ca90e8dcc1d92d0"`,
    );
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f382af58ab36057334fb262efd"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4305aedaa7aed08419da6a29ec"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_51b8b26ac168fbe7d6f5653e6c"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    await queryRunner.query(`DROP TYPE "public"."users_provider_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7129d2dc499f9f4c1e0c81cc9f"`,
    );
    await queryRunner.query(`DROP TABLE "user_roles"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a87cf0659c3ac379b339acf36a"`,
    );
    await queryRunner.query(`DROP TABLE "roles"`);
    await queryRunner.query(`DROP TABLE "role_permissions"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_89456a09b598ce8915c702c528"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_017943867ed5ceef9c03edd974"`,
    );
    await queryRunner.query(`DROP TABLE "permissions"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e9a3f1f8966f1cae54c487c0eb"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_fad96a937dbbbfc18e568815ec"`,
    );
    await queryRunner.query(`DROP TABLE "action_tokens"`);
    await queryRunner.query(`DROP TYPE "public"."action_tokens_type_enum"`);
  }
}
