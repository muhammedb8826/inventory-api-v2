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
  legalName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  tagline?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  taxId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  registrationNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  invoiceHeaderText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  invoiceFooterText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  termsAndConditions?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  bankDetails?: string | null;
}

export type LogoVariant = 'light' | 'dark';

/** Company branding for app chrome and printable documents. */
export type BrandingResponse = {
  appName: string;
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
  /** @deprecated Prefer logoLightUrl */
  logoUrl: string | null;
  legalName: string | null;
  tagline: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  taxId: string | null;
  registrationNumber: string | null;
  invoiceHeaderText: string | null;
  invoiceFooterText: string | null;
  termsAndConditions: string | null;
  bankDetails: string | null;
  updatedAt: string;
};
