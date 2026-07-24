import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { LocationType } from '../../common/enums';

export class CreateLocationDto {
  @IsString()
  name: string;

  @IsEnum(LocationType)
  type: LocationType;

  @IsOptional()
  @IsString()
  address?: string;
}

export class UpdateLocationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(LocationType)
  type?: LocationType;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
