import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { NotificationType } from '../../common/enums';

export class CreateNotificationDto {
  @IsUUID()
  userId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  module: string;

  @IsEnum(NotificationType)
  type: NotificationType;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsString()
  @MinLength(1)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  entityType?: string;

  @IsOptional()
  @IsUUID()
  entityId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
