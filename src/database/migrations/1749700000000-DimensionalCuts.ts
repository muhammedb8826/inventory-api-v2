import { MigrationInterface, QueryRunner } from 'typeorm';

export class DimensionalCuts1749700000000 implements MigrationInterface {
  name = 'DimensionalCuts1749700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "items_dimension_price_mode_enum" AS ENUM ('AREA', 'PIECE');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      ALTER TABLE "items"
      ADD COLUMN IF NOT EXISTS "dimension_price_mode" "items_dimension_price_mode_enum"
    `);

    for (const table of ['sale_lines', 'purchase_lines']) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
        ADD COLUMN IF NOT EXISTS "dim_width" numeric(18,9)
      `);
      await queryRunner.query(`
        ALTER TABLE "${table}"
        ADD COLUMN IF NOT EXISTS "dim_height" numeric(18,9)
      `);
      await queryRunner.query(`
        ALTER TABLE "${table}"
        ADD COLUMN IF NOT EXISTS "dim_pieces" numeric(14,3)
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['sale_lines', 'purchase_lines']) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "dim_pieces"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "dim_height"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "dim_width"`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "items" DROP COLUMN IF EXISTS "dimension_price_mode"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "items_dimension_price_mode_enum"`,
    );
  }
}
