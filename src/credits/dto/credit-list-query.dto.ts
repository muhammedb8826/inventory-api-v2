import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { CreditStatus } from '../../common/enums';
import { DateRangeQueryDto } from '../../common/dto/date-range.dto';

export class CreditListQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsEnum(CreditStatus)
  status?: CreditStatus;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
