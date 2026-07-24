import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { BankAccountType } from '../../common/enums';

export class BankAccountsQueryDto {
  @IsOptional()
  @IsEnum(BankAccountType)
  type?: BankAccountType;

  @IsOptional()
  @IsIn(['true', 'false'])
  includeInactive?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
