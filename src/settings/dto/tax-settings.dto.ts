import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { TaxMode } from '../../common/enums';

export class UpdateTaxSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  defaultPercent?: number;

  @IsOptional()
  @IsEnum(TaxMode)
  defaultMode?: TaxMode;

  @IsOptional()
  @IsBoolean()
  applyToSales?: boolean;

  @IsOptional()
  @IsBoolean()
  applyToPurchases?: boolean;
}

export type TaxSettingsView = {
  id: string;
  enabled: boolean;
  defaultPercent: number;
  defaultMode: TaxMode;
  applyToSales: boolean;
  applyToPurchases: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Defaults for sales/purchase UI. */
export type TaxDefaultsView = {
  enabled: boolean;
  defaultPercent: number;
  defaultMode: TaxMode;
  applyToSales: boolean;
  applyToPurchases: boolean;
};
