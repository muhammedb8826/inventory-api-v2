import { MigrationInterface, QueryRunner } from 'typeorm';

export class SaleLineKitComponents1749600000000 implements MigrationInterface {
  name = 'SaleLineKitComponents1749600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sale_line_components" (
        "id" uuid NOT NULL,
        "sale_line_id" uuid NOT NULL,
        "component_item_id" uuid NOT NULL,
        "stock_quantity" numeric(14,3) NOT NULL,
        CONSTRAINT "PK_sale_line_components" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sale_line_components_sale_line"
          FOREIGN KEY ("sale_line_id") REFERENCES "sale_lines"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_sale_line_components_item"
          FOREIGN KEY ("component_item_id") REFERENCES "items"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_sale_line_components_sale_line"
      ON "sale_line_components" ("sale_line_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_sale_line_components_item"
      ON "sale_line_components" ("component_item_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_sale_line_components_item"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_sale_line_components_sale_line"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "sale_line_components"`);
  }
}
