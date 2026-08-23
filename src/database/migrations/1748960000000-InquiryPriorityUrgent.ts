import { MigrationInterface, QueryRunner } from 'typeorm';

export class InquiryPriorityUrgent1748960000000 implements MigrationInterface {
  name = 'InquiryPriorityUrgent1748960000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "customer_inquiries_priority_enum"
          ADD VALUE IF NOT EXISTS 'URGENT';
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }

  public async down(): Promise<void> {
    // PostgreSQL cannot remove a single enum value safely; leave URGENT in place.
  }
}
