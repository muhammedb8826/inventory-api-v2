import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateUomCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  code: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  hasConstantWidth?: boolean;
}

export class UpdateUomCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  hasConstantWidth?: boolean;
}

export class CreateUomDto {
  @IsUUID()
  categoryId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  code: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  symbol: string;

  /** How many category-base units = 1 of this UOM. */
  @Type(() => Number)
  @IsNumber()
  @Min(0.000000001)
  conversionFactor: number;

  @IsOptional()
  @IsBoolean()
  isBase?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateUomDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  symbol?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.000000001)
  conversionFactor?: number;

  @IsOptional()
  @IsBoolean()
  isBase?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpsertItemUomDto {
  @IsUUID()
  uomId: string;

  /** How many stock-UOM units = 1 of this UOM for the item. */
  @Type(() => Number)
  @IsNumber()
  @Min(0.000000001)
  conversionFactor: number;
}

export class ConvertQtyDto {
  @IsUUID()
  itemId: string;

  @IsUUID()
  fromUomId: string;

  @IsOptional()
  @IsUUID()
  toUomId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity: number;
}
