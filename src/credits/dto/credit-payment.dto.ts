import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreditPaymentDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  /** Cash/bank account that receives (customer) or pays (supplier) the amount. */
  @IsUUID()
  bankAccountId: string;

  /** Optional installment / remittance note (e.g. "Term 2 of 3"). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  notes?: string;
}
