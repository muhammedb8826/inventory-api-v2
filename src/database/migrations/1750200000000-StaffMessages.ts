import { MigrationInterface, QueryRunner } from 'typeorm';
import { randomUUID } from 'crypto';

export class StaffMessages1750200000000 implements MigrationInterface {
  name = 'StaffMessages1750200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "staff_messages" (
        "id" uuid NOT NULL,
        "from_user_id" uuid NOT NULL,
        "to_user_id" uuid NOT NULL,
        "body" text NOT NULL,
        "read_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_staff_messages" PRIMARY KEY ("id"),
        CONSTRAINT "FK_staff_messages_from_user"
          FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_staff_messages_to_user"
          FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_staff_messages_to_read"
      ON "staff_messages" ("to_user_id", "read_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_staff_messages_from_created"
      ON "staff_messages" ("from_user_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_staff_messages_to_created"
      ON "staff_messages" ("to_user_id", "created_at")
    `);

    const perms = [
      {
        code: 'messages.read',
        name: 'View staff messages',
        module: 'messages',
      },
      {
        code: 'messages.write',
        name: 'Send staff messages',
        module: 'messages',
      },
    ];

    for (const perm of perms) {
      const existing = await queryRunner.query(
        `SELECT id FROM permissions WHERE code = $1 LIMIT 1`,
        [perm.code],
      );
      let permId: string;
      if (existing.length === 0) {
        permId = randomUUID();
        await queryRunner.query(
          `INSERT INTO permissions (id, code, name, module, created_at, updated_at)
           VALUES ($1, $2, $3, $4, now(), now())`,
          [permId, perm.code, perm.name, perm.module],
        );
      } else {
        permId = existing[0].id;
      }

      await queryRunner.query(
        `
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, $1::uuid
        FROM roles r
        WHERE NOT EXISTS (
          SELECT 1 FROM role_permissions rp
          WHERE rp.role_id = r.id AND rp.permission_id = $1::uuid
        )
        `,
        [permId],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      DELETE FROM role_permissions
      WHERE permission_id IN (
        SELECT id FROM permissions WHERE code IN ('messages.read', 'messages.write')
      )
      `,
    );
    await queryRunner.query(
      `DELETE FROM permissions WHERE code IN ('messages.read', 'messages.write')`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_staff_messages_to_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_staff_messages_from_created"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_staff_messages_to_read"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "staff_messages"`);
  }
}
