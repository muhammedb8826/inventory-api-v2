import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Align inquiry statuses with ERP quotation wording:
 * DRAFT, QUOTED, ORDERED, LOST, CANCELLED
 * (replaces NEW / IN_PROGRESS / CONVERTED / CLOSED)
 */
export class InquiryStatusErp1750600000000 implements MigrationInterface {
  name = 'InquiryStatusErp1750600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customer_inquiries"
      ALTER COLUMN "status" DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_inquiries"
      ALTER COLUMN "status" TYPE text
      USING ("status"::text)
    `);
    await queryRunner.query(`
      UPDATE "customer_inquiries"
      SET "status" = 'DRAFT'
      WHERE "status" IN ('NEW', 'IN_PROGRESS')
    `);
    await queryRunner.query(`
      UPDATE "customer_inquiries"
      SET "status" = 'ORDERED'
      WHERE "status" = 'CONVERTED'
    `);
    await queryRunner.query(`
      UPDATE "customer_inquiries"
      SET "status" = 'LOST'
      WHERE "status" = 'CLOSED'
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "customer_inquiries_status_enum"
    `);
    await queryRunner.query(`
      CREATE TYPE "customer_inquiries_status_enum" AS ENUM (
        'DRAFT', 'QUOTED', 'ORDERED', 'LOST', 'CANCELLED'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_inquiries"
      ALTER COLUMN "status" TYPE "customer_inquiries_status_enum"
      USING ("status"::"customer_inquiries_status_enum")
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_inquiries"
      ALTER COLUMN "status" SET DEFAULT 'DRAFT'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customer_inquiries"
      ALTER COLUMN "status" DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_inquiries"
      ALTER COLUMN "status" TYPE text
      USING ("status"::text)
    `);
    await queryRunner.query(`
      UPDATE "customer_inquiries"
      SET "status" = 'NEW'
      WHERE "status" = 'DRAFT'
    `);
    await queryRunner.query(`
      UPDATE "customer_inquiries"
      SET "status" = 'CONVERTED'
      WHERE "status" = 'ORDERED'
    `);
    await queryRunner.query(`
      UPDATE "customer_inquiries"
      SET "status" = 'CLOSED'
      WHERE "status" = 'LOST'
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "customer_inquiries_status_enum"
    `);
    await queryRunner.query(`
      CREATE TYPE "customer_inquiries_status_enum" AS ENUM (
        'NEW', 'IN_PROGRESS', 'QUOTED', 'CONVERTED', 'CLOSED', 'CANCELLED'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_inquiries"
      ALTER COLUMN "status" TYPE "customer_inquiries_status_enum"
      USING ("status"::"customer_inquiries_status_enum")
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_inquiries"
      ALTER COLUMN "status" SET DEFAULT 'NEW'
    `);
  }
}
