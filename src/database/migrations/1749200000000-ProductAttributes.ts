import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductAttributes1749200000000 implements MigrationInterface {
  name = 'ProductAttributes1749200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_attributes" (
        "id" uuid NOT NULL,
        "code" character varying(40) NOT NULL,
        "name" character varying(80) NOT NULL,
        "description" text,
        "display_type" character varying(20) NOT NULL DEFAULT 'select',
        "sequence" integer NOT NULL DEFAULT 10,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_attributes" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_product_attributes_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_attribute_values" (
        "id" uuid NOT NULL,
        "attribute_id" uuid NOT NULL,
        "code" character varying(40) NOT NULL,
        "name" character varying(80) NOT NULL,
        "color_hex" character varying(7),
        "sequence" integer NOT NULL DEFAULT 10,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_attribute_values" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_product_attribute_values_attr_code" UNIQUE ("attribute_id", "code"),
        CONSTRAINT "FK_product_attribute_values_attribute" FOREIGN KEY ("attribute_id")
          REFERENCES "product_attributes"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_attribute_values_attribute"
      ON "product_attribute_values" ("attribute_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "product_attribute_values"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "product_attributes"`);
  }
}
