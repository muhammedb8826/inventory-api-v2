import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod, CommissionBasis } from '../../common/enums';
import { resolveLineItemIdFromPayload } from '../../common/utils/line-item-id.util';

export class SaleLineDto {
  @Transform(({ obj }) =>
    resolveLineItemIdFromPayload(obj as Record<string, unknown>),
  )
  @IsUUID('4', {
    message:
      'itemId must be a product UUID — use inventory.itemId or item.id from GET /inventory',
  })
  itemId: string;

  /** Required unless width+height cut is provided. */
  @ValidateIf((o: SaleLineDto) => o.width == null || o.height == null)
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity?: number;

  /** Transaction UOM; defaults to item sales UOM then stock UOM. */
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

export class CreateSaleDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsUUID()
  locationId: string;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsOptional()
  @IsUUID()
  bankAccountId?: string;

  @IsOptional()
  @IsBoolean()
  allowNegativeStock?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  creditDueDate?: string;

  @IsOptional()
  @IsUUID()
  soldByUserId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPercent?: number;

  @IsOptional()
  @IsEnum(CommissionBasis)
  commissionBasis?: CommissionBasis;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleLineDto)
  lines: SaleLineDto[];
}
