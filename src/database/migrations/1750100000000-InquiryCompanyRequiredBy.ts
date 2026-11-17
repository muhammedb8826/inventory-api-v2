import { MigrationInterface, QueryRunner } from 'typeorm';

export class InquiryCompanyRequiredBy1750100000000
  implements MigrationInterface
{
  name = 'InquiryCompanyRequiredBy1750100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customer_inquiries"
      ADD COLUMN IF NOT EXISTS "company_name" varchar(150)
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_inquiries"
      ADD COLUMN IF NOT EXISTS "required_by_at" TIMESTAMPTZ
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customer_inquiries"
      DROP COLUMN IF EXISTS "required_by_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_inquiries"
      DROP COLUMN IF EXISTS "company_name"
    `);
  }
}
