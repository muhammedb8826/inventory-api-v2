import { MigrationInterface, QueryRunner } from 'typeorm';

export class InquiryAssignmentStatus1749010000000
  implements MigrationInterface
{
  name = 'InquiryAssignmentStatus1749010000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "inquiry_assignment_status_enum" AS ENUM (
          'UNASSIGNED', 'PENDING', 'ACCEPTED', 'DECLINED'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "customer_inquiries"
      ADD COLUMN IF NOT EXISTS "assignment_status" "inquiry_assignment_status_enum"
        NOT NULL DEFAULT 'UNASSIGNED'
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_inquiries"
      ADD COLUMN IF NOT EXISTS "assigned_at" TIMESTAMPTZ
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_inquiries"
      ADD COLUMN IF NOT EXISTS "accepted_at" TIMESTAMPTZ
    `);

    // Existing assigned rows are treated as already accepted (no pending backlog).
    await queryRunner.query(`
      UPDATE "customer_inquiries"
      SET
        "assignment_status" = 'ACCEPTED',
        "assigned_at" = COALESCE("assigned_at", "updated_at", "created_at"),
        "accepted_at" = COALESCE("accepted_at", "updated_at", "created_at")
      WHERE "assigned_to_user_id" IS NOT NULL
    `);
    await queryRunner.query(`
      UPDATE "customer_inquiries"
      SET "assignment_status" = 'UNASSIGNED'
      WHERE "assigned_to_user_id" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_customer_inquiries_assignment_status"
      ON "customer_inquiries" ("assignment_status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_customer_inquiries_assignment_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_inquiries"
      DROP COLUMN IF EXISTS "accepted_at",
      DROP COLUMN IF EXISTS "assigned_at",
      DROP COLUMN IF EXISTS "assignment_status"
    `);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "inquiry_assignment_status_enum"`,
    );
  }
}
