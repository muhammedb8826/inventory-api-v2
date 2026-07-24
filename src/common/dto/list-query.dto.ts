import { IsOptional, IsString } from 'class-validator';
import { DateRangeQueryDto } from './date-range.dto';

export class ListQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}
