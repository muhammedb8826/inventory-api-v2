import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { CreditSource, CreditStatus } from '../../common/enums';
import { DateRangeQueryDto } from '../../common/dto/date-range.dto';

export class CreditListQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsEnum(CreditStatus)
  status?: CreditStatus;

  @IsOptional()
  @IsEnum(CreditSource)
  source?: CreditSource;

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
