import { MigrationInterface, QueryRunner } from 'typeorm';
import { randomUUID } from 'crypto';

export class CommissionSettings1751000000000 implements MigrationInterface {
  name = 'CommissionSettings1751000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "commission_settings" (
        "id" character varying(32) NOT NULL DEFAULT 'default',
        "enabled" boolean NOT NULL DEFAULT true,
        "default_percent" numeric(5,2) NOT NULL DEFAULT 10,
        "default_basis" "sales_commission_basis_enum" NOT NULL DEFAULT 'PROFIT',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_commission_settings" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      INSERT INTO "commission_settings" ("id", "enabled", "default_percent", "default_basis")
      VALUES ('default', true, 10, 'PROFIT')
      ON CONFLICT ("id") DO NOTHING
    `);

    const existing = await queryRunner.query(
      `SELECT id FROM permissions WHERE code = $1 LIMIT 1`,
      ['sales.commission'],
    );
    let permId: string;
    if (existing.length === 0) {
      permId = randomUUID();
      await queryRunner.query(
        `INSERT INTO permissions (id, code, name, module, created_at, updated_at)
         VALUES ($1, $2, $3, $4, now(), now())`,
        [
          permId,
          'sales.commission',
          'Override sale commission rate / basis',
          'sales',
        ],
      );
    } else {
      permId = existing[0].id;
    }

    // Managers only — Admin role (Sales Rep must not self-set commission).
    await queryRunner.query(
      `
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, $1::uuid
      FROM roles r
      WHERE r.name = 'Admin'
        AND NOT EXISTS (
          SELECT 1 FROM role_permissions rp
          WHERE rp.role_id = r.id AND rp.permission_id = $1::uuid
        )
      `,
      [permId],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      DELETE FROM role_permissions
      WHERE permission_id IN (
        SELECT id FROM permissions WHERE code = 'sales.commission'
      )
      `,
    );
    await queryRunner.query(
      `DELETE FROM permissions WHERE code = 'sales.commission'`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "commission_settings"`);
  }
}
