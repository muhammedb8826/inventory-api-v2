import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { LocationType } from '../../common/enums';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class LocationListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(LocationType)
  type?: LocationType;

  @IsOptional()
  @IsIn(['true', 'false'])
  includeInactive?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
