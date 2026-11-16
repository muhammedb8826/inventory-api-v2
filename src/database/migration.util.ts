import { QueryRunner } from 'typeorm';

export async function tableExists(
  queryRunner: QueryRunner,
  table: string,
): Promise<boolean> {
  const rows: Array<{ exists: boolean }> = await queryRunner.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = $1
      ) AS "exists"
    `,
    [table],
  );
  return Boolean(rows[0]?.exists);
}
