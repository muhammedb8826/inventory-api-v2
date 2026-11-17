import { MigrationInterface, QueryRunner } from 'typeorm';

export class ItemAttributeValues1749300000000 implements MigrationInterface {
  name = 'ItemAttributeValues1749300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "item_attribute_values" (
        "id" uuid NOT NULL,
        "item_id" uuid NOT NULL,
        "attribute_value_id" uuid NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_item_attribute_values" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_item_attribute_values_item_value" UNIQUE ("item_id", "attribute_value_id"),
        CONSTRAINT "FK_item_attribute_values_item" FOREIGN KEY ("item_id")
          REFERENCES "items"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_item_attribute_values_value" FOREIGN KEY ("attribute_value_id")
          REFERENCES "product_attribute_values"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_item_attribute_values_item"
      ON "item_attribute_values" ("item_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_item_attribute_values_value"
      ON "item_attribute_values" ("attribute_value_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "item_attribute_values"`);
  }
}
