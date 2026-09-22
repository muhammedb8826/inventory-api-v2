import { MigrationInterface, QueryRunner } from 'typeorm';

export class ItemImage1748990000000 implements MigrationInterface {
  name = 'ItemImage1748990000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "items"
      ADD COLUMN IF NOT EXISTS "image_path" character varying(500)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "items"
      DROP COLUMN IF EXISTS "image_path"
    `);
  }
}
