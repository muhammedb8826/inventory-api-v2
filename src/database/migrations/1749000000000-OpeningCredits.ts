import { MigrationInterface, QueryRunner } from 'typeorm';

export class OpeningCredits1749000000000 implements MigrationInterface {
  name = 'OpeningCredits1749000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "credit_source_enum" AS ENUM ('SALE', 'PURCHASE', 'OPENING');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "customer_credits"
      ALTER COLUMN "sale_id" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_credits"
      ADD COLUMN IF NOT EXISTS "source" "credit_source_enum" NOT NULL DEFAULT 'SALE'
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_credits"
      ADD COLUMN IF NOT EXISTS "reference" character varying(100)
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_credits"
      ADD COLUMN IF NOT EXISTS "notes" text
    `);
    await queryRunner.query(`
      UPDATE "customer_credits"
      SET "source" = 'OPENING'
      WHERE "sale_id" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "supplier_credits"
      ALTER COLUMN "purchase_id" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "supplier_credits"
      ADD COLUMN IF NOT EXISTS "source" "credit_source_enum" NOT NULL DEFAULT 'PURCHASE'
    `);
    await queryRunner.query(`
      ALTER TABLE "supplier_credits"
      ADD COLUMN IF NOT EXISTS "reference" character varying(100)
    `);
    await queryRunner.query(`
      ALTER TABLE "supplier_credits"
      ADD COLUMN IF NOT EXISTS "notes" text
    `);
    await queryRunner.query(`
      UPDATE "supplier_credits"
      SET "source" = 'OPENING'
      WHERE "purchase_id" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "customer_credits" WHERE "sale_id" IS NULL
    `);
    await queryRunner.query(`
      DELETE FROM "supplier_credits" WHERE "purchase_id" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_credits"
      DROP COLUMN IF EXISTS "notes",
      DROP COLUMN IF EXISTS "reference",
      DROP COLUMN IF EXISTS "source"
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_credits"
      ALTER COLUMN "sale_id" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "supplier_credits"
      DROP COLUMN IF EXISTS "notes",
      DROP COLUMN IF EXISTS "reference",
      DROP COLUMN IF EXISTS "source"
    `);
    await queryRunner.query(`
      ALTER TABLE "supplier_credits"
      ALTER COLUMN "purchase_id" SET NOT NULL
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "credit_source_enum"`);
  }
}
