import { MigrationInterface, QueryRunner } from 'typeorm';

export class NotificationProductionType1750800000000
  implements MigrationInterface
{
  name = 'NotificationProductionType1750800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "notifications_type_enum" ADD VALUE IF NOT EXISTS 'PRODUCTION';
      EXCEPTION
        WHEN undefined_object THEN NULL;
      END $$;
    `);
  }

  public async down(): Promise<void> {
    // PostgreSQL cannot easily remove enum values.
  }
}
