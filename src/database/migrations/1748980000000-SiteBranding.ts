import { MigrationInterface, QueryRunner } from 'typeorm';
import { randomUUID } from 'crypto';

export class SiteBranding1748980000000 implements MigrationInterface {
  name = 'SiteBranding1748980000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "site_branding" (
        "id" uuid NOT NULL,
        "app_name" character varying(80) NOT NULL DEFAULT 'Stock',
        "hero_image_path" character varying(500),
        "headline" character varying(160),
        "supporting_text" character varying(400),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_site_branding" PRIMARY KEY ("id")
      )
    `);

    const existing: Array<{ count: string }> = await queryRunner.query(
      `SELECT COUNT(*)::text AS count FROM "site_branding"`,
    );
    if (Number(existing[0]?.count ?? 0) === 0) {
      await queryRunner.query(
        `
          INSERT INTO "site_branding"
            ("id", "app_name", "hero_image_path", "headline", "supporting_text")
          VALUES ($1, $2, NULL, NULL, NULL)
        `,
        [randomUUID(), 'Stock'],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "site_branding"`);
  }
}
