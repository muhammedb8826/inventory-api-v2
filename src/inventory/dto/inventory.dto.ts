import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { DimensionPriceMode, ItemType } from '../../common/enums';
import { VariantAttributeDto } from './variant-attribute.dto';

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

  /** Cut-line pricing: AREA (per m²) or PIECE. Null/omit = non-dimensional. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEnum(DimensionPriceMode)
  dimensionPriceMode?: DimensionPriceMode | null;

  @IsOptional()
  @IsEnum(ItemType)
  itemType?: ItemType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  reorderPoint?: number;

  /** Selected product attribute value IDs (one per attribute) — simple item. */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  attributeValueIds?: string[];

  /**
   * Product variants: multi-select values per attribute.
   * When combinations ≥ 2, creates a template + one stockable variant each.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantAttributeDto)
  variantAttributes?: VariantAttributeDto[];
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
  @ValidateIf((_, value) => value !== null)
  @IsEnum(DimensionPriceMode)
  dimensionPriceMode?: DimensionPriceMode | null;

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

  /** Replace item attribute values. Omit to leave unchanged; `[]` clears. */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  attributeValueIds?: string[];
}
