import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ProductionOrderStatus } from '../../common/enums';
import { DateRangeQueryDto } from '../../common/dto/date-range.dto';

export class CreateProductionOrderDto {
  @IsUUID()
  bomId: string;

  @IsUUID()
  locationId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantityPlanned: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class IssueProductionLineDto {
  @IsUUID()
  componentItemId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity: number;
}

export class IssueProductionDto {
  /** If omitted, issues all remaining required material. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IssueProductionLineDto)
  lines?: IssueProductionLineDto[];
}

export class CompleteProductionDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity: number;

  /** If true, auto-issue any missing materials needed for this completion qty. Default true. */
  @IsOptional()
  @IsBoolean()
  autoIssue?: boolean;
}

export class ProductionOrderListQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  finishedItemId?: string;

  @IsOptional()
  @IsUUID()
  bomId?: string;

  @IsOptional()
  @IsEnum(ProductionOrderStatus)
  status?: ProductionOrderStatus;

  @IsOptional()
  @IsString()
  @MinLength(1)
  search?: string;
}
