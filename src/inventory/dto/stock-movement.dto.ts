import { IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { DateRangeQueryDto } from '../../common/dto/date-range.dto';
import { StockMovementRefType } from '../../common/enums';

export class StockMovementListQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  itemId?: string;

  @IsOptional()
  @IsEnum(StockMovementRefType)
  refType?: StockMovementRefType;

  @IsOptional()
  @IsUUID()
  refId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  search?: string;
}
