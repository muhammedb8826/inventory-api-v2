import { Type } from 'class-transformer';
import {
  Allow,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { BomType } from '../../common/enums';
import { ListQueryDto } from '../../common/dto/list-query.dto';

export class BomLineDto {
  @IsUUID()
  componentItemId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity: number;

  /** Component UOM; defaults to component stock UOM. */
  @IsOptional()
  @IsUUID()
  uomId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  scrapPercent?: number;
}

/** PATCH lines — ignores read-only fields from GET responses. */
export class UpdateBomLineDto extends BomLineDto {
  @Allow()
  id?: string;

  @Allow()
  bomId?: string;

  @Allow()
  componentItem?: unknown;

  @Allow()
  bom?: unknown;
}

export class CreateBomDto {
  @IsUUID()
  finishedItemId: string;

  /** Optional product variant of finishedItemId. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  variantItemId?: string | null;

  /** BoM reference — optional; defaults to product name when empty. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  version?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity?: number;

  @IsOptional()
  @IsEnum(BomType)
  bomType?: BomType;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BomLineDto)
  lines: BomLineDto[];
}

export class UpdateBomDto {
  @Allow()
  id?: string;

  @IsOptional()
  @IsUUID()
  finishedItemId?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  variantItemId?: string | null;

  @Allow()
  finishedItem?: unknown;

  @Allow()
  variantItem?: unknown;

  @Allow()
  createdAt?: unknown;

  @Allow()
  updatedAt?: unknown;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  version?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity?: number;

  @IsOptional()
  @IsEnum(BomType)
  bomType?: BomType;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateBomLineDto)
  lines?: UpdateBomLineDto[];
}

export class BomListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID()
  finishedItemId?: string;

  @IsOptional()
  @IsString()
  isActive?: string;

  /** Filter by BoM type, e.g. MANUFACTURE for production. */
  @IsOptional()
  @IsEnum(BomType)
  bomType?: BomType;
}
