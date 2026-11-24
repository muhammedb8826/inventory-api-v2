import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { CommissionBasis } from '../../common/enums';

export class UpdateCommissionSettingsDto {
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
  @IsEnum(CommissionBasis)
  defaultBasis?: CommissionBasis;
}

export type CommissionSettingsView = {
  id: string;
  enabled: boolean;
  defaultPercent: number;
  defaultBasis: CommissionBasis;
  createdAt: string;
  updatedAt: string;
};

/** Defaults for the sales form (any authenticated sales user). */
export type CommissionDefaultsView = {
  enabled: boolean;
  defaultPercent: number;
  defaultBasis: CommissionBasis;
};
