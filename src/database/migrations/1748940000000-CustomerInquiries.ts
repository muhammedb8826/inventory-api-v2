import { MigrationInterface, QueryRunner } from 'typeorm';

export class CustomerInquiries1748940000000 implements MigrationInterface {
  name = 'CustomerInquiries1748940000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "customer_inquiries_status_enum" AS ENUM (
          'NEW', 'IN_PROGRESS', 'QUOTED', 'CONVERTED', 'CLOSED', 'CANCELLED'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "customer_inquiries_priority_enum" AS ENUM (
          'LOW', 'NORMAL', 'HIGH'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "customer_inquiries_source_enum" AS ENUM (
          'PUBLIC', 'INTERNAL'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "customer_inquiries" (
        "id" uuid NOT NULL,
        "contact_name" character varying(150) NOT NULL,
        "phone" character varying(50),
        "email" character varying(150),
        "subject" character varying(200) NOT NULL,
        "message" text NOT NULL,
        "status" "customer_inquiries_status_enum" NOT NULL DEFAULT 'NEW',
        "priority" "customer_inquiries_priority_enum" NOT NULL DEFAULT 'NORMAL',
        "source" "customer_inquiries_source_enum" NOT NULL,
        "customer_id" uuid,
        "item_id" uuid,
        "assigned_to_user_id" uuid,
        "created_by_id" uuid,
        "internal_notes" text,
        "follow_up_at" TIMESTAMPTZ,
        "converted_sale_id" uuid,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_customer_inquiries" PRIMARY KEY ("id"),
        CONSTRAINT "FK_customer_inquiries_customer" FOREIGN KEY ("customer_id")
          REFERENCES "customers"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_customer_inquiries_item" FOREIGN KEY ("item_id")
          REFERENCES "items"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_customer_inquiries_assigned" FOREIGN KEY ("assigned_to_user_id")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_customer_inquiries_created_by" FOREIGN KEY ("created_by_id")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_customer_inquiries_sale" FOREIGN KEY ("converted_sale_id")
          REFERENCES "sales"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_customer_inquiries_status_created"
      ON "customer_inquiries" ("status", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_customer_inquiries_source_created"
      ON "customer_inquiries" ("source", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_customer_inquiries_source_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_customer_inquiries_status_created"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "customer_inquiries"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "customer_inquiries_source_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "customer_inquiries_priority_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "customer_inquiries_status_enum"`,
    );
  }
}
