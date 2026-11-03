import { Type } from 'class-transformer';
import { IsNumber, IsUUID, Min } from 'class-validator';

export class CreditPaymentDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  /** Cash/bank account that receives (customer) or pays (supplier) the amount. */
  @IsUUID()
  bankAccountId: string;
}
