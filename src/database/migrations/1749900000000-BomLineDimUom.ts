import { MigrationInterface, QueryRunner } from 'typeorm';

export class BomLineDimUom1749900000000 implements MigrationInterface {
  name = 'BomLineDimUom1749900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bom_lines"
      ADD COLUMN IF NOT EXISTS "dim_uom_id" uuid
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "bom_lines"
        ADD CONSTRAINT "FK_bom_lines_dim_uom"
        FOREIGN KEY ("dim_uom_id") REFERENCES "uoms"("id")
        ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bom_lines" DROP CONSTRAINT IF EXISTS "FK_bom_lines_dim_uom"
    `);
    await queryRunner.query(`
      ALTER TABLE "bom_lines" DROP COLUMN IF EXISTS "dim_uom_id"
    `);
  }
}
