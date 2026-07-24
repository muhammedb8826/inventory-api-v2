import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaymentMethod } from '../../common/enums';
import { DocumentListQueryDto } from '../../common/dto/document-list-query.dto';

export class SalesListQueryDto extends DocumentListQueryDto {
  @IsOptional()
  @IsUUID()
  soldByUserId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;
}
