import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateAttributeDto {
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
  @IsIn(['select', 'radio', 'color'])
  displayType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sequence?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAttributeDto {
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
  @IsIn(['select', 'radio', 'color'])
  displayType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sequence?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateAttributeValueDto {
  @IsUUID()
  attributeId: string;

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
  @MaxLength(7)
  colorHex?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sequence?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAttributeValueDto {
  @IsOptional()
  @IsUUID()
  attributeId?: string;

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
  @MaxLength(7)
  colorHex?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sequence?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
