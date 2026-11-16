import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';
import { ItemType } from '../../common/enums';

export class CreateInventoryDto {
  @IsOptional()
  @IsString()
  sku?: string;

  @IsString()
  description: string;

  @IsUUID()
  locationId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  purchasePrice: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsUUID()
  stockUomId?: string;

  @IsOptional()
  @IsUUID()
  salesUomId?: string;

  @IsOptional()
  @IsUUID()
  purchaseUomId?: string;

  /** Length→Area factor (area per 1 length-base unit). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  uomWidth?: number;

  @IsOptional()
  @IsEnum(ItemType)
  itemType?: ItemType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  reorderPoint?: number;
}

export class UpdateInventoryDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  sku?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  unit?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  stockUomId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  salesUomId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  purchaseUomId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  uomWidth?: number | null;

  @IsOptional()
  @IsEnum(ItemType)
  itemType?: ItemType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  purchasePrice?: number;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  reorderPoint?: number | null;
}
