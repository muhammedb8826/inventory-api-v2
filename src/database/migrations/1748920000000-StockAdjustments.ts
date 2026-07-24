import { MigrationInterface, QueryRunner } from 'typeorm';

export class StockAdjustments1748920000000 implements MigrationInterface {
  name = 'StockAdjustments1748920000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "stock_adjustments_direction_enum" AS ENUM ('in', 'out');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "stock_adjustments_reason_enum" AS ENUM (
          'DAMAGE', 'LOSS', 'FOUND', 'COUNT', 'OPENING', 'RETURN', 'OTHER'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "stock_adjustments" (
        "id" uuid NOT NULL,
        "location_id" uuid NOT NULL,
        "item_id" uuid NOT NULL,
        "direction" "stock_adjustments_direction_enum" NOT NULL,
        "quantity" numeric(14,3) NOT NULL,
        "quantity_before" numeric(14,3) NOT NULL,
        "quantity_after" numeric(14,3) NOT NULL,
        "reason" "stock_adjustments_reason_enum" NOT NULL,
        "notes" text,
        "reference" character varying(100),
        "created_by_id" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stock_adjustments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_stock_adjustments_location" FOREIGN KEY ("location_id")
          REFERENCES "locations"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_stock_adjustments_item" FOREIGN KEY ("item_id")
          REFERENCES "items"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_stock_adjustments_user" FOREIGN KEY ("created_by_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stock_adjustments_location_created"
      ON "stock_adjustments" ("location_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stock_adjustments_item_created"
      ON "stock_adjustments" ("item_id", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_adjustments"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "stock_adjustments_reason_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "stock_adjustments_direction_enum"`,
    );
  }
}
