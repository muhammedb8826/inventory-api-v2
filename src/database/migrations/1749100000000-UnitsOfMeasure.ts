import { MigrationInterface, QueryRunner } from 'typeorm';
import { tableExists } from '../migration.util';

export class UnitsOfMeasure1749100000000 implements MigrationInterface {
  name = 'UnitsOfMeasure1749100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "uom_categories" (
        "id" uuid NOT NULL,
        "code" character varying(40) NOT NULL,
        "name" character varying(80) NOT NULL,
        "description" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_uom_categories" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_uom_categories_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "uoms" (
        "id" uuid NOT NULL,
        "category_id" uuid NOT NULL,
        "code" character varying(40) NOT NULL,
        "name" character varying(80) NOT NULL,
        "symbol" character varying(20) NOT NULL,
        "conversion_factor" numeric(18,9) NOT NULL DEFAULT 1,
        "is_base" boolean NOT NULL DEFAULT false,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_uoms" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_uoms_code" UNIQUE ("code"),
        CONSTRAINT "FK_uoms_category" FOREIGN KEY ("category_id")
          REFERENCES "uom_categories"("id") ON DELETE RESTRICT
      )
    `);

    if (await tableExists(queryRunner, 'items')) {
      await queryRunner.query(`
        ALTER TABLE "items"
        ADD COLUMN IF NOT EXISTS "stock_uom_id" uuid
      `);
      await queryRunner.query(`
        ALTER TABLE "items"
        ADD COLUMN IF NOT EXISTS "sales_uom_id" uuid
      `);
      await queryRunner.query(`
        ALTER TABLE "items"
        ADD COLUMN IF NOT EXISTS "purchase_uom_id" uuid
      `);
      await queryRunner.query(`
        ALTER TABLE "items"
        ADD COLUMN IF NOT EXISTS "uom_width" numeric(18,9)
      `);

      await queryRunner.query(`
        DO $$ BEGIN
          ALTER TABLE "items"
            ADD CONSTRAINT "FK_items_stock_uom"
            FOREIGN KEY ("stock_uom_id") REFERENCES "uoms"("id")
            ON DELETE SET NULL;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
      `);
      await queryRunner.query(`
        DO $$ BEGIN
          ALTER TABLE "items"
            ADD CONSTRAINT "FK_items_sales_uom"
            FOREIGN KEY ("sales_uom_id") REFERENCES "uoms"("id")
            ON DELETE SET NULL;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
      `);
      await queryRunner.query(`
        DO $$ BEGIN
          ALTER TABLE "items"
            ADD CONSTRAINT "FK_items_purchase_uom"
            FOREIGN KEY ("purchase_uom_id") REFERENCES "uoms"("id")
            ON DELETE SET NULL;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
      `);
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "item_uoms" (
        "id" uuid NOT NULL,
        "item_id" uuid NOT NULL,
        "uom_id" uuid NOT NULL,
        "conversion_factor" numeric(18,9) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_item_uoms" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_item_uoms_item_uom" UNIQUE ("item_id", "uom_id"),
        CONSTRAINT "FK_item_uoms_item" FOREIGN KEY ("item_id")
          REFERENCES "items"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_item_uoms_uom" FOREIGN KEY ("uom_id")
          REFERENCES "uoms"("id") ON DELETE RESTRICT
      )
    `);

    if (await tableExists(queryRunner, 'sale_lines')) {
      await queryRunner.query(`
        ALTER TABLE "sale_lines"
        ADD COLUMN IF NOT EXISTS "uom_id" uuid
      `);
      await queryRunner.query(`
        ALTER TABLE "sale_lines"
        ADD COLUMN IF NOT EXISTS "stock_quantity" numeric(14,3)
      `);
      await queryRunner.query(`
        DO $$ BEGIN
          ALTER TABLE "sale_lines"
            ADD CONSTRAINT "FK_sale_lines_uom"
            FOREIGN KEY ("uom_id") REFERENCES "uoms"("id")
            ON DELETE SET NULL;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
      `);
    }

    if (await tableExists(queryRunner, 'purchase_lines')) {
      await queryRunner.query(`
        ALTER TABLE "purchase_lines"
        ADD COLUMN IF NOT EXISTS "uom_id" uuid
      `);
      await queryRunner.query(`
        ALTER TABLE "purchase_lines"
        ADD COLUMN IF NOT EXISTS "stock_quantity" numeric(14,3)
      `);
      await queryRunner.query(`
        DO $$ BEGIN
          ALTER TABLE "purchase_lines"
            ADD CONSTRAINT "FK_purchase_lines_uom"
            FOREIGN KEY ("uom_id") REFERENCES "uoms"("id")
            ON DELETE SET NULL;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
      `);
    }

    if (await tableExists(queryRunner, 'bom_lines')) {
      await queryRunner.query(`
        ALTER TABLE "bom_lines"
        ADD COLUMN IF NOT EXISTS "uom_id" uuid
      `);
      await queryRunner.query(`
        ALTER TABLE "bom_lines"
        ADD COLUMN IF NOT EXISTS "stock_quantity" numeric(14,3)
      `);
      await queryRunner.query(`
        DO $$ BEGIN
          ALTER TABLE "bom_lines"
            ADD CONSTRAINT "FK_bom_lines_uom"
            FOREIGN KEY ("uom_id") REFERENCES "uoms"("id")
            ON DELETE SET NULL;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await tableExists(queryRunner, 'bom_lines')) {
      await queryRunner.query(
        `ALTER TABLE "bom_lines" DROP CONSTRAINT IF EXISTS "FK_bom_lines_uom"`,
      );
      await queryRunner.query(
        `ALTER TABLE "bom_lines" DROP COLUMN IF EXISTS "stock_quantity"`,
      );
      await queryRunner.query(
        `ALTER TABLE "bom_lines" DROP COLUMN IF EXISTS "uom_id"`,
      );
    }
    if (await tableExists(queryRunner, 'purchase_lines')) {
      await queryRunner.query(
        `ALTER TABLE "purchase_lines" DROP CONSTRAINT IF EXISTS "FK_purchase_lines_uom"`,
      );
      await queryRunner.query(
        `ALTER TABLE "purchase_lines" DROP COLUMN IF EXISTS "stock_quantity"`,
      );
      await queryRunner.query(
        `ALTER TABLE "purchase_lines" DROP COLUMN IF EXISTS "uom_id"`,
      );
    }
    if (await tableExists(queryRunner, 'sale_lines')) {
      await queryRunner.query(
        `ALTER TABLE "sale_lines" DROP CONSTRAINT IF EXISTS "FK_sale_lines_uom"`,
      );
      await queryRunner.query(
        `ALTER TABLE "sale_lines" DROP COLUMN IF EXISTS "stock_quantity"`,
      );
      await queryRunner.query(
        `ALTER TABLE "sale_lines" DROP COLUMN IF EXISTS "uom_id"`,
      );
    }

    await queryRunner.query(`DROP TABLE IF EXISTS "item_uoms"`);

    if (await tableExists(queryRunner, 'items')) {
      await queryRunner.query(
        `ALTER TABLE "items" DROP CONSTRAINT IF EXISTS "FK_items_purchase_uom"`,
      );
      await queryRunner.query(
        `ALTER TABLE "items" DROP CONSTRAINT IF EXISTS "FK_items_sales_uom"`,
      );
      await queryRunner.query(
        `ALTER TABLE "items" DROP CONSTRAINT IF EXISTS "FK_items_stock_uom"`,
      );
      await queryRunner.query(
        `ALTER TABLE "items" DROP COLUMN IF EXISTS "uom_width"`,
      );
      await queryRunner.query(
        `ALTER TABLE "items" DROP COLUMN IF EXISTS "purchase_uom_id"`,
      );
      await queryRunner.query(
        `ALTER TABLE "items" DROP COLUMN IF EXISTS "sales_uom_id"`,
      );
      await queryRunner.query(
        `ALTER TABLE "items" DROP COLUMN IF EXISTS "stock_uom_id"`,
      );
    }

    await queryRunner.query(`DROP TABLE IF EXISTS "uoms"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "uom_categories"`);
  }
}
