import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateBrandingDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  appName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  headline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  supportingText?: string;
}

export type BrandingResponse = {
  appName: string;
  heroImageUrl: string | null;
  headline: string | null;
  supportingText: string | null;
  updatedAt: string;
};
