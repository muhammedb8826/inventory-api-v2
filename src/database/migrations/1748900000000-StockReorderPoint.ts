import { MigrationInterface, QueryRunner } from 'typeorm';

export class StockReorderPoint1748900000000 implements MigrationInterface {
  name = 'StockReorderPoint1748900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "stock_levels"
      ADD COLUMN IF NOT EXISTS "reorder_point" numeric(14,3)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "stock_levels"
      DROP COLUMN IF EXISTS "reorder_point"
    `);
  }
}
