import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '../../common/enums';
import { resolveLineItemIdFromPayload } from '../../common/utils/line-item-id.util';

export class PurchaseLineDto {
  @Transform(({ obj }) =>
    resolveLineItemIdFromPayload(obj as Record<string, unknown>),
  )
  @IsUUID('4', {
    message:
      'itemId must be a product UUID — use inventory.itemId or item.id from GET /inventory, not the stock row id alone unless it is the item id',
  })
  itemId: string;

  /** Required unless width+height cut is provided. */
  @ValidateIf((o: PurchaseLineDto) => o.width == null || o.height == null)
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity?: number;

  /** Transaction UOM; defaults to item purchase UOM then stock UOM. */
  @IsOptional()
  @IsUUID()
  uomId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice: number;

  /** Cut dimensions (Area stock items with dimension pricing). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.000000001)
  width?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.000000001)
  height?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  pieces?: number;
}

export class CreatePurchaseDto {
  @IsUUID()
  supplierId: string;

  @IsUUID()
  locationId: string;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsOptional()
  @IsUUID()
  bankAccountId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  creditDueDate?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseLineDto)
  lines: PurchaseLineDto[];
}
