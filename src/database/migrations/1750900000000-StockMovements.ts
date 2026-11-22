import { MigrationInterface, QueryRunner } from 'typeorm';
import { tableExists } from '../migration.util';

export class StockMovements1750900000000 implements MigrationInterface {
  name = 'StockMovements1750900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await tableExists(queryRunner, 'stock_levels'))) return;

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "stock_movements_ref_type_enum" AS ENUM (
          'sale',
          'purchase',
          'stock_transfer',
          'stock_adjustment',
          'production',
          'opening'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "stock_movements" (
        "id" uuid NOT NULL,
        "location_id" uuid NOT NULL,
        "item_id" uuid NOT NULL,
        "quantity_delta" numeric(14,3) NOT NULL,
        "quantity_before" numeric(14,3) NOT NULL,
        "quantity_after" numeric(14,3) NOT NULL,
        "ref_type" "stock_movements_ref_type_enum",
        "ref_id" uuid,
        "notes" text,
        "created_by_id" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stock_movements" PRIMARY KEY ("id"),
        CONSTRAINT "FK_stock_movements_location" FOREIGN KEY ("location_id")
          REFERENCES "locations"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_stock_movements_item" FOREIGN KEY ("item_id")
          REFERENCES "items"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_stock_movements_user" FOREIGN KEY ("created_by_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stock_movements_item_created"
      ON "stock_movements" ("item_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stock_movements_location_created"
      ON "stock_movements" ("location_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stock_movements_ref"
      ON "stock_movements" ("ref_type", "ref_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_movements"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "stock_movements_ref_type_enum"`,
    );
  }
}
