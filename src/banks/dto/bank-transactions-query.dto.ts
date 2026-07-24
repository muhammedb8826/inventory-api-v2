import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import {
  BankTransactionDirection,
  BankTransactionType,
} from '../../common/enums';
import { DateRangeQueryDto } from '../../common/dto/date-range.dto';

export class BankTransactionsQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsUUID()
  bankAccountId?: string;

  @IsOptional()
  @IsEnum(BankTransactionType)
  type?: BankTransactionType;

  @IsOptional()
  @IsEnum(BankTransactionDirection)
  direction?: BankTransactionDirection;

  @IsOptional()
  @IsString()
  search?: string;
}
