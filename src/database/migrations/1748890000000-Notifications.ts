import { MigrationInterface, QueryRunner } from 'typeorm';

export class Notifications1748890000000 implements MigrationInterface {
  name = 'Notifications1748890000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "notifications_type_enum" AS ENUM (
          'LOW_STOCK',
          'STOCK_TRANSFER',
          'SALE',
          'PURCHASE',
          'CREDIT_DUE',
          'EXPENSE',
          'SYSTEM'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notifications" (
        "id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "module" character varying(80) NOT NULL,
        "type" "notifications_type_enum" NOT NULL,
        "title" character varying(200) NOT NULL,
        "message" text NOT NULL,
        "entity_type" character varying(50),
        "entity_id" uuid,
        "is_read" boolean NOT NULL DEFAULT false,
        "read_at" TIMESTAMPTZ,
        "metadata" jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notifications_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_notifications_user_read"
      ON "notifications" ("user_id", "is_read")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_notifications_user_created"
      ON "notifications" ("user_id", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "notifications_type_enum"`);
  }
}
