import { MigrationInterface, QueryRunner } from 'typeorm';

export class InquiryQuoteFields1750400000000 implements MigrationInterface {
  name = 'InquiryQuoteFields1750400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customer_inquiry_lines"
      ADD COLUMN IF NOT EXISTS "unit_price" numeric(14,2)
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_inquiries"
      ADD COLUMN IF NOT EXISTS "valid_until" TIMESTAMPTZ
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_inquiries"
      ADD COLUMN IF NOT EXISTS "quoted_at" TIMESTAMPTZ
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_inquiries"
      ADD COLUMN IF NOT EXISTS "subtotal" numeric(14,2)
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_inquiries"
      ADD COLUMN IF NOT EXISTS "total" numeric(14,2)
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_inquiries"
      ADD COLUMN IF NOT EXISTS "quote_terms" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customer_inquiries" DROP COLUMN IF EXISTS "quote_terms"
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_inquiries" DROP COLUMN IF EXISTS "total"
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_inquiries" DROP COLUMN IF EXISTS "subtotal"
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_inquiries" DROP COLUMN IF EXISTS "quoted_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_inquiries" DROP COLUMN IF EXISTS "valid_until"
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_inquiry_lines" DROP COLUMN IF EXISTS "unit_price"
    `);
  }
}
