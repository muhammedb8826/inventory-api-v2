import { MigrationInterface, QueryRunner } from 'typeorm';

export class UomCategoryHasConstantWidth1750300000000
  implements MigrationInterface
{
  name = 'UomCategoryHasConstantWidth1750300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "uom_categories"
      ADD COLUMN IF NOT EXISTS "has_constant_width" boolean NOT NULL DEFAULT false
    `);
    // Existing AREA catalog (fabric/roll) should opt in by default.
    await queryRunner.query(`
      UPDATE "uom_categories"
      SET "has_constant_width" = true
      WHERE UPPER("code") = 'AREA'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "uom_categories"
      DROP COLUMN IF EXISTS "has_constant_width"
    `);
  }
}
