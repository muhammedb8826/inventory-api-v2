import { MigrationInterface, QueryRunner } from 'typeorm';
import { tableExists } from '../migration.util';

export class ProductionOrderSaleId1750700000000 implements MigrationInterface {
  name = 'ProductionOrderSaleId1750700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await tableExists(queryRunner, 'production_orders'))) return;
    if (!(await tableExists(queryRunner, 'sales'))) return;

    await queryRunner.query(`
      ALTER TABLE "production_orders"
      ADD COLUMN IF NOT EXISTS "sale_id" uuid
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "production_orders"
        ADD CONSTRAINT "FK_production_orders_sale"
        FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_production_orders_sale"
      ON "production_orders" ("sale_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await tableExists(queryRunner, 'production_orders'))) return;

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_production_orders_sale"
    `);
    await queryRunner.query(`
      ALTER TABLE "production_orders"
      DROP CONSTRAINT IF EXISTS "FK_production_orders_sale"
    `);
    await queryRunner.query(`
      ALTER TABLE "production_orders"
      DROP COLUMN IF EXISTS "sale_id"
    `);
  }
}
