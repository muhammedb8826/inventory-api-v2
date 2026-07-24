import { Type } from 'class-transformer';
import { IsDateString, IsOptional } from 'class-validator';
import { PaginationQueryDto } from './pagination.dto';

export class DateRangeQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export function parseDateRange(from?: string, to?: string) {
  const start = from ? new Date(from) : undefined;
  const end = to ? new Date(to) : undefined;
  if (end) {
    end.setHours(23, 59, 59, 999);
  }
  return { start, end };
}
