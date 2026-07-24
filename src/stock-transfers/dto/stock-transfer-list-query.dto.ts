import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { TransferStatus } from '../../common/enums';
import { DateRangeQueryDto } from '../../common/dto/date-range.dto';

export class StockTransferListQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsUUID()
  fromLocationId?: string;

  @IsOptional()
  @IsUUID()
  toLocationId?: string;

  @IsOptional()
  @IsEnum(TransferStatus)
  status?: TransferStatus;

  @IsOptional()
  @IsString()
  search?: string;
}
