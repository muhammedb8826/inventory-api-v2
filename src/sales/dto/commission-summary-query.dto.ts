import { IsOptional, IsUUID } from 'class-validator';
import { DateRangeQueryDto } from '../../common/dto/date-range.dto';

export class CommissionSummaryQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsUUID()
  soldByUserId?: string;
}
