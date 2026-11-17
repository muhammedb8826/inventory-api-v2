import { MigrationInterface, QueryRunner } from 'typeorm';

export class BomLineDimensionalCuts1749800000000 implements MigrationInterface {
  name = 'BomLineDimensionalCuts1749800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bom_lines"
      ADD COLUMN IF NOT EXISTS "dim_width" numeric(18,9)
    `);
    await queryRunner.query(`
      ALTER TABLE "bom_lines"
      ADD COLUMN IF NOT EXISTS "dim_height" numeric(18,9)
    `);
    await queryRunner.query(`
      ALTER TABLE "bom_lines"
      ADD COLUMN IF NOT EXISTS "dim_pieces" numeric(14,3)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bom_lines" DROP COLUMN IF EXISTS "dim_pieces"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bom_lines" DROP COLUMN IF EXISTS "dim_height"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bom_lines" DROP COLUMN IF EXISTS "dim_width"`,
    );
  }
}
