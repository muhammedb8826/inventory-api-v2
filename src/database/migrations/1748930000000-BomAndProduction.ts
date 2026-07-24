import { MigrationInterface, QueryRunner } from 'typeorm';

export class BomAndProduction1748930000000 implements MigrationInterface {
  name = 'BomAndProduction1748930000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "items_item_type_enum" AS ENUM ('RAW', 'SEMI', 'FINISHED', 'OTHER');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE "items"
      ADD COLUMN IF NOT EXISTS "item_type" "items_item_type_enum" NOT NULL DEFAULT 'OTHER'
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "boms" (
        "id" uuid NOT NULL,
        "finished_item_id" uuid NOT NULL,
        "name" character varying(120) NOT NULL,
        "version" character varying(40),
        "is_active" boolean NOT NULL DEFAULT true,
        "notes" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_boms" PRIMARY KEY ("id"),
        CONSTRAINT "FK_boms_finished_item" FOREIGN KEY ("finished_item_id")
          REFERENCES "items"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bom_lines" (
        "id" uuid NOT NULL,
        "bom_id" uuid NOT NULL,
        "component_item_id" uuid NOT NULL,
        "quantity" numeric(14,3) NOT NULL,
        "scrap_percent" numeric(5,2) NOT NULL DEFAULT 0,
        CONSTRAINT "PK_bom_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bom_lines_bom" FOREIGN KEY ("bom_id")
          REFERENCES "boms"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_bom_lines_component" FOREIGN KEY ("component_item_id")
          REFERENCES "items"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "production_orders_status_enum" AS ENUM (
          'DRAFT', 'RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "production_orders" (
        "id" uuid NOT NULL,
        "bom_id" uuid NOT NULL,
        "finished_item_id" uuid NOT NULL,
        "location_id" uuid NOT NULL,
        "quantity_planned" numeric(14,3) NOT NULL,
        "quantity_completed" numeric(14,3) NOT NULL DEFAULT 0,
        "status" "production_orders_status_enum" NOT NULL DEFAULT 'DRAFT',
        "notes" text,
        "created_by_id" uuid,
        "released_at" TIMESTAMPTZ,
        "completed_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_production_orders" PRIMARY KEY ("id"),
        CONSTRAINT "FK_production_orders_bom" FOREIGN KEY ("bom_id")
          REFERENCES "boms"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_production_orders_finished_item" FOREIGN KEY ("finished_item_id")
          REFERENCES "items"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_production_orders_location" FOREIGN KEY ("location_id")
          REFERENCES "locations"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_production_orders_user" FOREIGN KEY ("created_by_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "production_order_lines" (
        "id" uuid NOT NULL,
        "production_order_id" uuid NOT NULL,
        "component_item_id" uuid NOT NULL,
        "quantity_required" numeric(14,3) NOT NULL,
        "quantity_issued" numeric(14,3) NOT NULL DEFAULT 0,
        CONSTRAINT "PK_production_order_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_production_order_lines_order" FOREIGN KEY ("production_order_id")
          REFERENCES "production_orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_production_order_lines_component" FOREIGN KEY ("component_item_id")
          REFERENCES "items"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_production_orders_status"
      ON "production_orders" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_production_orders_location"
      ON "production_orders" ("location_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "production_order_lines"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "production_orders"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "production_orders_status_enum"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "bom_lines"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "boms"`);
    await queryRunner.query(`
      ALTER TABLE "items" DROP COLUMN IF EXISTS "item_type"
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "items_item_type_enum"`);
  }
}
