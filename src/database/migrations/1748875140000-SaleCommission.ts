import { MigrationInterface, QueryRunner } from 'typeorm';

export class SaleCommission1748875140000 implements MigrationInterface {
  name = 'SaleCommission1748875140000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales"
      ADD COLUMN IF NOT EXISTS "sold_by_user_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "sales"
      ADD COLUMN IF NOT EXISTS "commission_percent" numeric(5,2) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      ALTER TABLE "sales"
      ADD COLUMN IF NOT EXISTS "commission_amount" numeric(14,2) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "sales"
          ADD CONSTRAINT "FK_sales_sold_by_user"
          FOREIGN KEY ("sold_by_user_id") REFERENCES "users"("id")
          ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales" DROP CONSTRAINT IF EXISTS "FK_sales_sold_by_user"
    `);
    await queryRunner.query(`
      ALTER TABLE "sales" DROP COLUMN IF EXISTS "sold_by_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "sales" DROP COLUMN IF EXISTS "commission_percent"
    `);
    await queryRunner.query(`
      ALTER TABLE "sales" DROP COLUMN IF EXISTS "commission_amount"
    `);
  }
}
