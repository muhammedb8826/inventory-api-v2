import { IsOptional, IsUUID } from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';

export class InventoryListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;
}
