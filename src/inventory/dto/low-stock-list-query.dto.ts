import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class LowStockListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;
}
