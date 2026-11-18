import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';

export class CreateStaffMessageDto {
  @IsUUID()
  toUserId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body: string;
}

export class StaffMessageThreadQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID()
  withUserId?: string;
}
