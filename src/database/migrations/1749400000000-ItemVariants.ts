import { MigrationInterface, QueryRunner } from 'typeorm';

export class ItemVariants1749400000000 implements MigrationInterface {
  name = 'ItemVariants1749400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "items"
      ADD COLUMN IF NOT EXISTS "is_template" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      ALTER TABLE "items"
      ADD COLUMN IF NOT EXISTS "parent_item_id" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "items"
      ADD COLUMN IF NOT EXISTS "variant_key" character varying(200)
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "items"
          ADD CONSTRAINT "FK_items_parent_item"
          FOREIGN KEY ("parent_item_id") REFERENCES "items"("id") ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_items_parent_variant_key"
      ON "items" ("parent_item_id", "variant_key")
      WHERE "parent_item_id" IS NOT NULL AND "variant_key" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_items_parent_item"
      ON "items" ("parent_item_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_items_parent_item"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_items_parent_variant_key"`);
    await queryRunner.query(`
      ALTER TABLE "items" DROP CONSTRAINT IF EXISTS "FK_items_parent_item"
    `);
    await queryRunner.query(`
      ALTER TABLE "items" DROP COLUMN IF EXISTS "variant_key"
    `);
    await queryRunner.query(`
      ALTER TABLE "items" DROP COLUMN IF EXISTS "parent_item_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "items" DROP COLUMN IF EXISTS "is_template"
    `);
  }
}
