import { MigrationInterface, QueryRunner } from 'typeorm';
import { randomUUID } from 'crypto';

export class TaxSettings1751100000000 implements MigrationInterface {
  name = 'TaxSettings1751100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "tax_mode_enum" AS ENUM ('EXCLUSIVE', 'INCLUSIVE');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tax_settings" (
        "id" character varying(32) NOT NULL DEFAULT 'default',
        "enabled" boolean NOT NULL DEFAULT false,
        "default_percent" numeric(5,2) NOT NULL DEFAULT 0,
        "default_mode" "tax_mode_enum" NOT NULL DEFAULT 'EXCLUSIVE',
        "apply_to_sales" boolean NOT NULL DEFAULT true,
        "apply_to_purchases" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tax_settings" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      INSERT INTO "tax_settings" (
        "id", "enabled", "default_percent", "default_mode",
        "apply_to_sales", "apply_to_purchases"
      )
      VALUES ('default', false, 0, 'EXCLUSIVE', true, true)
      ON CONFLICT ("id") DO NOTHING
    `);

    await queryRunner.query(`
      ALTER TABLE "sales"
      ADD COLUMN IF NOT EXISTS "tax_percent" numeric(5,2) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "sales"
      ADD COLUMN IF NOT EXISTS "tax_amount" numeric(14,2) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "sales"
      ADD COLUMN IF NOT EXISTS "tax_mode" "tax_mode_enum" NOT NULL DEFAULT 'EXCLUSIVE'
    `);

    await queryRunner.query(`
      ALTER TABLE "purchases"
      ADD COLUMN IF NOT EXISTS "tax_percent" numeric(5,2) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "purchases"
      ADD COLUMN IF NOT EXISTS "tax_amount" numeric(14,2) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "purchases"
      ADD COLUMN IF NOT EXISTS "tax_mode" "tax_mode_enum" NOT NULL DEFAULT 'EXCLUSIVE'
    `);

    const perms = [
      {
        code: 'sales.tax',
        name: 'Override sale tax rate / mode',
        module: 'sales',
      },
      {
        code: 'purchase.tax',
        name: 'Override purchase tax rate / mode',
        module: 'purchase',
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
        WHERE r.name = 'Admin'
          AND NOT EXISTS (
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
        SELECT id FROM permissions
        WHERE code IN ('sales.tax', 'purchase.tax')
      )
      `,
    );
    await queryRunner.query(
      `DELETE FROM permissions WHERE code IN ('sales.tax', 'purchase.tax')`,
    );

    await queryRunner.query(
      `ALTER TABLE "sales" DROP COLUMN IF EXISTS "tax_mode"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales" DROP COLUMN IF EXISTS "tax_amount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales" DROP COLUMN IF EXISTS "tax_percent"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchases" DROP COLUMN IF EXISTS "tax_mode"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchases" DROP COLUMN IF EXISTS "tax_amount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchases" DROP COLUMN IF EXISTS "tax_percent"`,
    );

    await queryRunner.query(`DROP TABLE IF EXISTS "tax_settings"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "tax_mode_enum"`);
  }
}
