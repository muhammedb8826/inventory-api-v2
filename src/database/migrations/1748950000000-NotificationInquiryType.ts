import { MigrationInterface, QueryRunner } from 'typeorm';

export class NotificationInquiryType1748950000000 implements MigrationInterface {
  name = 'NotificationInquiryType1748950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS 'INQUIRY';
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
  }

  public async down(): Promise<void> {
    // PostgreSQL cannot remove a single enum value safely; leave INQUIRY in place.
  }
}
