import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  StockAdjustmentDirection,
  StockAdjustmentReason,
} from '../../common/enums';
import { DateRangeQueryDto } from '../../common/dto/date-range.dto';

export class CreateStockAdjustmentDto {
  @IsUUID()
  locationId: string;

  @IsUUID()
  itemId: string;

  @IsEnum(StockAdjustmentDirection)
  direction: StockAdjustmentDirection;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity: number;

  @IsEnum(StockAdjustmentReason)
  reason: StockAdjustmentReason;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  /** Optional unit cost when increasing stock (FOUND / OPENING / RETURN). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  purchasePrice?: number;
}

export class StockAdjustmentListQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  itemId?: string;

  @IsOptional()
  @IsEnum(StockAdjustmentDirection)
  direction?: StockAdjustmentDirection;

  @IsOptional()
  @IsEnum(StockAdjustmentReason)
  reason?: StockAdjustmentReason;

  @IsOptional()
  @IsString()
  @MinLength(1)
  search?: string;
}
