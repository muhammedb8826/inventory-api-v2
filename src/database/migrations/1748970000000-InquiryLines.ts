import { randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';

export class InquiryLines1748970000000 implements MigrationInterface {
  name = 'InquiryLines1748970000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "customer_inquiry_lines" (
        "id" uuid NOT NULL,
        "inquiry_id" uuid NOT NULL,
        "item_id" uuid NOT NULL,
        "quantity" numeric(14,3),
        "notes" text,
        CONSTRAINT "PK_customer_inquiry_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_customer_inquiry_lines_inquiry" FOREIGN KEY ("inquiry_id")
          REFERENCES "customer_inquiries"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_customer_inquiry_lines_item" FOREIGN KEY ("item_id")
          REFERENCES "items"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_customer_inquiry_lines_inquiry"
      ON "customer_inquiry_lines" ("inquiry_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_customer_inquiry_lines_item"
      ON "customer_inquiry_lines" ("item_id")
    `);

    const itemCol: Array<{ column_name: string }> = await queryRunner.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'customer_inquiries'
        AND column_name = 'item_id'
    `);

    if (itemCol.length > 0) {
      const legacy: Array<{ id: string; item_id: string }> =
        await queryRunner.query(`
          SELECT "id", "item_id"
          FROM "customer_inquiries"
          WHERE "item_id" IS NOT NULL
        `);
      for (const row of legacy) {
        await queryRunner.query(
          `
            INSERT INTO "customer_inquiry_lines"
              ("id", "inquiry_id", "item_id", "quantity", "notes")
            VALUES ($1, $2, $3, NULL, NULL)
          `,
          [randomUUID(), row.id, row.item_id],
        );
      }

      await queryRunner.query(`
        DO $$ DECLARE r record;
        BEGIN
          FOR r IN
            SELECT con.conname
            FROM pg_constraint con
            JOIN pg_class rel ON rel.oid = con.conrelid
            WHERE rel.relname = 'customer_inquiries'
              AND con.contype = 'f'
              AND pg_get_constraintdef(con.oid) ILIKE '%item_id%'
          LOOP
            EXECUTE format('ALTER TABLE customer_inquiries DROP CONSTRAINT %I', r.conname);
          END LOOP;
        END $$;
      `);
      await queryRunner.query(`
        ALTER TABLE "customer_inquiries"
        DROP COLUMN IF EXISTS "item_id"
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customer_inquiries"
      ADD COLUMN IF NOT EXISTS "item_id" uuid
    `);
    await queryRunner.query(`
      UPDATE "customer_inquiries" i
      SET "item_id" = sub."item_id"
      FROM (
        SELECT DISTINCT ON ("inquiry_id") "inquiry_id", "item_id"
        FROM "customer_inquiry_lines"
        ORDER BY "inquiry_id", "id"
      ) sub
      WHERE i."id" = sub."inquiry_id"
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "customer_inquiries"
          ADD CONSTRAINT "FK_customer_inquiries_item"
          FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_customer_inquiry_lines_item"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_customer_inquiry_lines_inquiry"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "customer_inquiry_lines"`);
  }
}
