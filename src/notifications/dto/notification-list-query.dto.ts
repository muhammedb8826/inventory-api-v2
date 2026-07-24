import { IsIn, IsOptional, IsString } from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';

export class NotificationListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsIn(['true', 'false'])
  isRead?: string;

  @IsOptional()
  @IsString()
  module?: string;
}
