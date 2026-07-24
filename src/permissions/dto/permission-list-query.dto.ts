import { IsOptional, IsString } from 'class-validator';

export class PermissionListQueryDto {
  @IsOptional()
  @IsString()
  module?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
