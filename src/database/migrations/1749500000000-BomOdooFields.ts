import { MigrationInterface, QueryRunner } from 'typeorm';

export class BomOdooFields1749500000000 implements MigrationInterface {
  name = 'BomOdooFields1749500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "boms_bom_type_enum" AS ENUM ('MANUFACTURE', 'KIT');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      ALTER TABLE "boms"
      ADD COLUMN IF NOT EXISTS "quantity" numeric(14,3) NOT NULL DEFAULT 1
    `);

    await queryRunner.query(`
      ALTER TABLE "boms"
      ADD COLUMN IF NOT EXISTS "bom_type" "boms_bom_type_enum" NOT NULL DEFAULT 'MANUFACTURE'
    `);

    await queryRunner.query(`
      ALTER TABLE "boms"
      ADD COLUMN IF NOT EXISTS "variant_item_id" uuid
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "boms"
          ADD CONSTRAINT "FK_boms_variant_item"
          FOREIGN KEY ("variant_item_id") REFERENCES "items"("id") ON DELETE RESTRICT;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_boms_variant_item"
      ON "boms" ("variant_item_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_boms_variant_item"`);
    await queryRunner.query(`
      ALTER TABLE "boms" DROP CONSTRAINT IF EXISTS "FK_boms_variant_item"
    `);
    await queryRunner.query(`
      ALTER TABLE "boms" DROP COLUMN IF EXISTS "variant_item_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "boms" DROP COLUMN IF EXISTS "bom_type"
    `);
    await queryRunner.query(`
      ALTER TABLE "boms" DROP COLUMN IF EXISTS "quantity"
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "boms_bom_type_enum"`);
  }
}
