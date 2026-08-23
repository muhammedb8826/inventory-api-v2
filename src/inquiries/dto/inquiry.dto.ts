import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  InquiryPriority,
  InquirySource,
  InquiryStatus,
} from '../../common/enums';
import { ListQueryDto } from '../../common/dto/list-query.dto';

export class InquiryLineDto {
  @IsUUID()
  itemId: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

/** Shared contact + message fields for public and internal create. */
export class CreateInquiryBaseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  contactName: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subject: string;

  @IsString()
  @MinLength(1)
  message: string;

  /**
   * Preferred: multiple catalog items of interest.
   * Legacy: single `itemId` still accepted and stored as one line.
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InquiryLineDto)
  lines?: InquiryLineDto[];

  /** @deprecated Prefer `lines`. Converted to a single line when `lines` omitted. */
  @IsOptional()
  @IsUUID()
  itemId?: string;
}

/** Website / unauthenticated submission. */
export class PublicCreateInquiryDto extends CreateInquiryBaseDto {}

/** Staff-created inquiry (walk-in / phone). */
export class CreateInquiryDto extends CreateInquiryBaseDto {
  @IsOptional()
  @IsEnum(InquiryPriority)
  priority?: InquiryPriority;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;

  @IsOptional()
  @IsString()
  internalNotes?: string;

  @IsOptional()
  @IsDateString()
  followUpAt?: string;
}

export class UpdateInquiryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== '')
  @IsEmail()
  @MaxLength(150)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  message?: string;

  @IsOptional()
  @IsEnum(InquiryStatus)
  status?: InquiryStatus;

  @IsOptional()
  @IsEnum(InquiryPriority)
  priority?: InquiryPriority;

  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InquiryLineDto)
  lines?: InquiryLineDto[];

  /** @deprecated Prefer `lines`. */
  @IsOptional()
  @IsUUID()
  itemId?: string | null;

  @IsOptional()
  @IsUUID()
  assignedToUserId?: string | null;

  @IsOptional()
  @IsString()
  internalNotes?: string | null;

  @IsOptional()
  @IsDateString()
  followUpAt?: string | null;

  @IsOptional()
  @IsUUID()
  convertedSaleId?: string | null;
}

export class InquiryListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsEnum(InquiryStatus)
  status?: InquiryStatus;

  @IsOptional()
  @IsEnum(InquirySource)
  source?: InquirySource;

  @IsOptional()
  @IsEnum(InquiryPriority)
  priority?: InquiryPriority;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;

  /** Filter inquiries that include this catalog item on any line. */
  @IsOptional()
  @IsUUID()
  itemId?: string;
}
