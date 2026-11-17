import { MigrationInterface, QueryRunner } from 'typeorm';

export class ItemDimensionUom1750000000000 implements MigrationInterface {
  name = 'ItemDimensionUom1750000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "items"
      ADD COLUMN IF NOT EXISTS "dimension_uom_id" uuid
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "items"
        ADD CONSTRAINT "FK_items_dimension_uom"
        FOREIGN KEY ("dimension_uom_id") REFERENCES "uoms"("id")
        ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "items" DROP CONSTRAINT IF EXISTS "FK_items_dimension_uom"`,
    );
    await queryRunner.query(
      `ALTER TABLE "items" DROP COLUMN IF EXISTS "dimension_uom_id"`,
    );
  }
}
