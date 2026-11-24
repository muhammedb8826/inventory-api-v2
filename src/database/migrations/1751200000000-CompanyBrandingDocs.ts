import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompanyBrandingDocs1751200000000 implements MigrationInterface {
  name = 'CompanyBrandingDocs1751200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "site_branding"
      ADD COLUMN IF NOT EXISTS "logo_light_path" character varying(500),
      ADD COLUMN IF NOT EXISTS "logo_dark_path" character varying(500),
      ADD COLUMN IF NOT EXISTS "legal_name" character varying(160),
      ADD COLUMN IF NOT EXISTS "tagline" character varying(200),
      ADD COLUMN IF NOT EXISTS "email" character varying(160),
      ADD COLUMN IF NOT EXISTS "phone" character varying(64),
      ADD COLUMN IF NOT EXISTS "website" character varying(200),
      ADD COLUMN IF NOT EXISTS "address" character varying(500),
      ADD COLUMN IF NOT EXISTS "tax_id" character varying(64),
      ADD COLUMN IF NOT EXISTS "registration_number" character varying(64),
      ADD COLUMN IF NOT EXISTS "invoice_header_text" character varying(400),
      ADD COLUMN IF NOT EXISTS "invoice_footer_text" text,
      ADD COLUMN IF NOT EXISTS "terms_and_conditions" text,
      ADD COLUMN IF NOT EXISTS "bank_details" text
    `);

    // Carry over legacy hero/logo path into light logo.
    await queryRunner.query(`
      UPDATE "site_branding"
      SET "logo_light_path" = "hero_image_path"
      WHERE "logo_light_path" IS NULL
        AND "hero_image_path" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "site_branding"
      DROP COLUMN IF EXISTS "bank_details",
      DROP COLUMN IF EXISTS "terms_and_conditions",
      DROP COLUMN IF EXISTS "invoice_footer_text",
      DROP COLUMN IF EXISTS "invoice_header_text",
      DROP COLUMN IF EXISTS "registration_number",
      DROP COLUMN IF EXISTS "tax_id",
      DROP COLUMN IF EXISTS "address",
      DROP COLUMN IF EXISTS "website",
      DROP COLUMN IF EXISTS "phone",
      DROP COLUMN IF EXISTS "email",
      DROP COLUMN IF EXISTS "tagline",
      DROP COLUMN IF EXISTS "legal_name",
      DROP COLUMN IF EXISTS "logo_dark_path",
      DROP COLUMN IF EXISTS "logo_light_path"
    `);
  }
}
