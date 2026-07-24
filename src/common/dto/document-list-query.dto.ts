import { IsIn, IsOptional, IsString } from 'class-validator';
import { DateRangeQueryDto } from './date-range.dto';

export class DocumentListQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsIn(['true', 'false'])
  includeVoided?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
