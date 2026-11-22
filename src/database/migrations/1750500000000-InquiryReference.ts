import { MigrationInterface, QueryRunner } from 'typeorm';

export class InquiryReference1750500000000 implements MigrationInterface {
  name = 'InquiryReference1750500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customer_inquiries"
      ADD COLUMN IF NOT EXISTS "reference" varchar(100)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customer_inquiries" DROP COLUMN IF EXISTS "reference"
    `);
  }
}
