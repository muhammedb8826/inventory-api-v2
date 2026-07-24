import {
  ObjectLiteral,
  SelectQueryBuilder,
  Repository,
  FindOptionsWhere,
  Between,
  MoreThanOrEqual,
  LessThanOrEqual,
} from 'typeorm';
import { parseDateRange } from '../dto/date-range.dto';

export function buildMeta(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export async function paginatedRepositoryFind<T extends ObjectLiteral>(
  repo: Repository<T>,
  options: {
    where?: FindOptionsWhere<T> | FindOptionsWhere<T>[];
    relations?: Record<string, boolean | object>;
    order?: Record<string, 'ASC' | 'DESC'>;
    page?: number;
    limit?: number;
    from?: string;
    to?: string;
    dateField?: keyof T & string;
  },
) {
  const page = options.page ?? 1;
  const limit = options.limit ?? 20;
  const where = options.where ?? {};

  if (options.from || options.to) {
    const { start, end } = parseDateRange(options.from, options.to);
    const field = (options.dateField ?? 'createdAt') as keyof T;
    if (start && end) {
      (where as Record<string, unknown>)[field as string] = Between(start, end);
    } else if (start) {
      (where as Record<string, unknown>)[field as string] =
        MoreThanOrEqual(start);
    } else if (end) {
      (where as Record<string, unknown>)[field as string] =
        LessThanOrEqual(end);
    }
  }

  const [data, total] = await repo.findAndCount({
    where,
    relations: options.relations as never,
    order: options.order as never,
    skip: (page - 1) * limit,
    take: limit,
  });

  return { data, meta: buildMeta(page, limit, total) };
}

export function applyDateRangeToQb<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  column: string,
  from?: string,
  to?: string,
) {
  const { start, end } = parseDateRange(from, to);
  if (start) qb.andWhere(`${column} >= :rangeStart`, { rangeStart: start });
  if (end) qb.andWhere(`${column} <= :rangeEnd`, { rangeEnd: end });
  return qb;
}

/** ILIKE search across one or more SQL column expressions. */
export function applyIlikeSearch<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  search: string | undefined,
  columns: string[],
  paramPrefix = 'search',
) {
  const term = search?.trim();
  if (!term || columns.length === 0) return qb;
  const clauses = columns.map((col, i) => `${col} ILIKE :${paramPrefix}${i}`);
  const params: Record<string, string> = {};
  columns.forEach((_, i) => {
    params[`${paramPrefix}${i}`] = `%${term}%`;
  });
  qb.andWhere(`(${clauses.join(' OR ')})`, params);
  return qb;
}

/** Search related rows without joining (safe to combine with leftJoinAndSelect later). */
export function applyRelatedIlikeSearch<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  search: string | undefined,
  directColumns: string[],
  related?: {
    table: string;
    alias: string;
    parentKey: string;
    relatedKey: string;
    columns: string[];
  },
) {
  const term = search?.trim();
  if (!term) return qb;

  const params = { relatedSearch: `%${term}%` };
  const clauses = directColumns.map((col) => `${col} ILIKE :relatedSearch`);

  if (related) {
    const inner = related.columns
      .map((col) => `${related.alias}.${col} ILIKE :relatedSearch`)
      .join(' OR ');
    clauses.push(
      `EXISTS (SELECT 1 FROM ${related.table} ${related.alias} WHERE ${related.alias}.${related.relatedKey} = ${related.parentKey} AND (${inner}))`,
    );
  }

  qb.andWhere(`(${clauses.join(' OR ')})`, params);
  return qb;
}

export async function paginatedQueryBuilder<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  page?: number,
  limit?: number,
) {
  const p = page ?? 1;
  const l = limit ?? 20;
  const [data, total] = await qb
    .skip((p - 1) * l)
    .take(l)
    .getManyAndCount();
  return { data, meta: buildMeta(p, l, total) };
}

/** Sum numeric columns over a filtered query (ignores pagination). */
export async function sumFilteredQueryBuilder<T extends ObjectLiteral>(
  filteredQb: SelectQueryBuilder<T>,
  fields: { key: string; sql: string; decimals?: number }[],
): Promise<Record<string, string>> {
  const qb = filteredQb.clone().orderBy();
  fields.forEach(({ key, sql }, index) => {
    if (index === 0) qb.select(sql, key);
    else qb.addSelect(sql, key);
  });
  const raw = await qb.getRawOne<Record<string, string>>();
  const totals: Record<string, string> = {};
  for (const { key, decimals = 2 } of fields) {
    totals[key] = parseFloat(raw?.[key] ?? '0').toFixed(decimals);
  }
  return totals;
}
