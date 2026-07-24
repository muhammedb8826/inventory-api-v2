import { MigrationInterface, QueryRunner } from 'typeorm';

export class BankTransactionDirection1748910000000 implements MigrationInterface {
  name = 'BankTransactionDirection1748910000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "bank_transactions_direction_enum" AS ENUM ('in', 'out');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE "bank_transactions"
      ADD COLUMN IF NOT EXISTS "direction" "bank_transactions_direction_enum"
    `);
    await queryRunner.query(`
      UPDATE "bank_transactions"
      SET "direction" = CASE
        WHEN "type"::text IN ('SALE', 'CREDIT_RECEIPT', 'OPENING') THEN 'in'::"bank_transactions_direction_enum"
        WHEN "type"::text IN ('PURCHASE', 'EXPENSE', 'CREDIT_PAYMENT') THEN 'out'::"bank_transactions_direction_enum"
        WHEN "type"::text = 'ADJUSTMENT' AND (
          "reference_type" ILIKE '%sale%reversal%'
          OR "reference_type" ILIKE '%credit_receipt%reversal%'
        ) THEN 'out'::"bank_transactions_direction_enum"
        WHEN "type"::text = 'ADJUSTMENT' THEN 'in'::"bank_transactions_direction_enum"
        ELSE 'out'::"bank_transactions_direction_enum"
      END
      WHERE "direction" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "bank_transactions"
      ALTER COLUMN "direction" SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bank_transactions"
      DROP COLUMN IF EXISTS "direction"
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "bank_transactions_direction_enum"
    `);
  }
}
