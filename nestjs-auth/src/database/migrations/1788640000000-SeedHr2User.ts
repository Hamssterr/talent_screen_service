import { MigrationInterface, QueryRunner } from 'typeorm';
import * as bcrypt from 'bcrypt';

export class SeedHr2User1788640000000 implements MigrationInterface {
  name = 'SeedHr2User1788640000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const email = 'hr2@gmail.com';
    const name = 'HR 2';
    // Hash mật khẩu '12345678' với bcrypt 12 rounds
    const passwordHash = await bcrypt.hash('12345678', 12);
    const hrRoleId = '00000000-0000-4000-8000-000000000002'; // ID cố định của role 'hr'

    // 1. Thêm user hr2@gmail.com vào bảng users (nếu chưa tồn tại)
    const insertUserResult = (await queryRunner.query(
      `INSERT INTO "users" ("email", "name", "passwordHash", "status")
       VALUES ($1, $2, $3, 'active')
       ON CONFLICT ("email") DO UPDATE 
       SET "passwordHash" = EXCLUDED."passwordHash", "status" = 'active'
       RETURNING "id"`,
      [email, name, passwordHash],
    )) as Array<{ id: string }>;

    const userId = insertUserResult[0]?.id;

    // 2. Gán role 'hr' cho user trong bảng user_roles
    if (userId) {
      await queryRunner.query(
        `INSERT INTO "user_roles" ("user_id", "role_id")
         VALUES ($1, $2)
         ON CONFLICT ("user_id", "role_id") DO NOTHING`,
        [userId, hrRoleId],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const email = 'hr2@gmail.com';

    // 1. Lấy id của user
    const users = (await queryRunner.query(
      `SELECT "id" FROM "users" WHERE "email" = $1`,
      [email],
    )) as Array<{ id: string }>;

    if (users.length > 0) {
      const userId = users[0].id;
      // 2. Xóa gán role trong user_roles
      await queryRunner.query(`DELETE FROM "user_roles" WHERE "user_id" = $1`, [
        userId,
      ]);
      // 3. Xóa user
      await queryRunner.query(`DELETE FROM "users" WHERE "id" = $1`, [userId]);
    }
  }
}
