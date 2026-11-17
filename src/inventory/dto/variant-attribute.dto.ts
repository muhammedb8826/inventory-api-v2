import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class VariantAttributeDto {
  @IsUUID()
  attributeId: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  valueIds: string[];
}

export class VariantAttributesPayload {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantAttributeDto)
  variantAttributes: VariantAttributeDto[];
}
