import { MigrationInterface, QueryRunner } from 'typeorm';

export class SaleCommissionBasis1748880000000 implements MigrationInterface {
  name = 'SaleCommissionBasis1748880000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "sales_commission_basis_enum" AS ENUM ('PROFIT', 'SALES');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE "sales"
      ADD COLUMN IF NOT EXISTS "commission_basis" "sales_commission_basis_enum" NOT NULL DEFAULT 'PROFIT'
    `);
    await queryRunner.query(`
      ALTER TABLE "sales"
      ALTER COLUMN "commission_percent" SET DEFAULT 10
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sales" DROP COLUMN IF EXISTS "commission_basis"
    `);
    await queryRunner.query(`
      ALTER TABLE "sales"
      ALTER COLUMN "commission_percent" SET DEFAULT 0
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "sales_commission_basis_enum"
    `);
  }
}
