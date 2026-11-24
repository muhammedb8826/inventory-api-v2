import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import {
  CommissionBasis,
  DEFAULT_COMMISSION_PERCENT,
  TaxMode,
} from '../common/enums';
import {
  COMMISSION_SETTINGS_ID,
  CommissionSettings,
} from '../database/entities/commission-settings.entity';
import { SiteBranding } from '../database/entities/site-branding.entity';
import {
  TAX_SETTINGS_ID,
  TaxSettings,
} from '../database/entities/tax-settings.entity';
import {
  BrandingResponse,
  LogoVariant,
  UpdateBrandingDto,
} from './dto/branding.dto';
import {
  CommissionDefaultsView,
  CommissionSettingsView,
  UpdateCommissionSettingsDto,
} from './dto/commission-settings.dto';
import {
  TaxDefaultsView,
  TaxSettingsView,
  UpdateTaxSettingsDto,
} from './dto/tax-settings.dto';

const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const MAX_BYTES = 5 * 1024 * 1024;

@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);
  private readonly uploadDir = join(process.cwd(), 'uploads', 'branding');

  constructor(
    @InjectRepository(SiteBranding)
    private readonly repo: Repository<SiteBranding>,
    @InjectRepository(CommissionSettings)
    private readonly commissionRepo: Repository<CommissionSettings>,
    @InjectRepository(TaxSettings)
    private readonly taxRepo: Repository<TaxSettings>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.ensureRow();
    await this.ensureCommissionSettings();
    await this.ensureTaxSettings();
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  /** Create `site_branding` when migrations/schema sync have not run yet (e.g. fresh cPanel DB). */
  private async ensureTable() {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS "site_branding" (
        "id" uuid NOT NULL,
        "app_name" character varying(80) NOT NULL DEFAULT 'Stock',
        "hero_image_path" character varying(500),
        "logo_light_path" character varying(500),
        "logo_dark_path" character varying(500),
        "headline" character varying(160),
        "supporting_text" character varying(400),
        "legal_name" character varying(160),
        "tagline" character varying(200),
        "email" character varying(160),
        "phone" character varying(64),
        "website" character varying(200),
        "address" character varying(500),
        "tax_id" character varying(64),
        "registration_number" character varying(64),
        "invoice_header_text" character varying(400),
        "invoice_footer_text" text,
        "terms_and_conditions" text,
        "bank_details" text,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_site_branding" PRIMARY KEY ("id")
      )
    `);
    await this.dataSource.query(`
      ALTER TABLE "site_branding"
      ADD COLUMN IF NOT EXISTS "logo_light_path" character varying(500),
      ADD COLUMN IF NOT EXISTS "logo_dark_path" character varying(500),
      ADD COLUMN IF NOT EXISTS "legal_name" character varying(160),
      ADD COLUMN IF NOT EXISTS "tagline" character varying(200),
      ADD COLUMN IF NOT EXISTS "email" character varying(160),
      ADD COLUMN IF NOT EXISTS "phone" character varying(64),
      ADD COLUMN IF NOT EXISTS "website" character varying(200),
      ADD COLUMN IF NOT EXISTS "address" character varying(500),
      ADD COLUMN IF NOT EXISTS "tax_id" character varying(64),
      ADD COLUMN IF NOT EXISTS "registration_number" character varying(64),
      ADD COLUMN IF NOT EXISTS "invoice_header_text" character varying(400),
      ADD COLUMN IF NOT EXISTS "invoice_footer_text" text,
      ADD COLUMN IF NOT EXISTS "terms_and_conditions" text,
      ADD COLUMN IF NOT EXISTS "bank_details" text
    `);
  }

  private async ensureRow() {
    try {
      await this.ensureTable();
      const count = await this.repo.count();
      if (count === 0) {
        await this.repo.save(
          this.repo.create({
            appName: 'Stock',
            heroImagePath: null,
            logoLightPath: null,
            logoDarkPath: null,
            headline: null,
            supportingText: null,
            legalName: null,
            tagline: null,
            email: null,
            phone: null,
            website: null,
            address: null,
            taxId: null,
            registrationNumber: null,
            invoiceHeaderText: null,
            invoiceFooterText: null,
            termsAndConditions: null,
            bankDetails: null,
          }),
        );
      }
    } catch (err) {
      this.logger.error(
        'Failed to ensure site_branding row; run schema:sync / migration:run',
        err instanceof Error ? err.stack : err,
      );
      throw err;
    }
  }

  private async getRow() {
    await this.ensureRow();
    const row = await this.repo.find({
      order: { createdAt: 'ASC' },
      take: 1,
    });
    return row[0];
  }

  private absoluteAssetUrl(
    path: string | null,
    requestBaseUrl?: string,
  ): string | null {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    const configured = this.config.get<string>('app.publicBaseUrl')?.trim();
    const base = (configured || requestBaseUrl || '').replace(/\/$/, '');
    if (!base) return path;
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private resolvedLightPath(row: SiteBranding): string | null {
    return row.logoLightPath || row.heroImagePath || null;
  }

  private toResponse(
    row: SiteBranding,
    requestBaseUrl?: string,
  ): BrandingResponse {
    const lightUrl = this.absoluteAssetUrl(
      this.resolvedLightPath(row),
      requestBaseUrl,
    );
    const darkUrl = this.absoluteAssetUrl(row.logoDarkPath, requestBaseUrl);
    return {
      appName: row.appName,
      logoLightUrl: lightUrl,
      logoDarkUrl: darkUrl,
      logoUrl: lightUrl,
      legalName: row.legalName,
      tagline: row.tagline,
      email: row.email,
      phone: row.phone,
      website: row.website,
      address: row.address,
      taxId: row.taxId,
      registrationNumber: row.registrationNumber,
      invoiceHeaderText: row.invoiceHeaderText,
      invoiceFooterText: row.invoiceFooterText,
      termsAndConditions: row.termsAndConditions,
      bankDetails: row.bankDetails,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async getBranding(requestBaseUrl?: string) {
    const row = await this.getRow();
    return this.toResponse(row, requestBaseUrl);
  }

  private emptyToNull(value: string | null | undefined): string | null {
    if (value === undefined) return null;
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  async updateBranding(dto: UpdateBrandingDto, requestBaseUrl?: string) {
    const row = await this.getRow();

    if (dto.appName !== undefined) {
      const name = dto.appName.trim();
      if (!name) throw new BadRequestException('appName cannot be empty');
      row.appName = name;
    }
    if (dto.legalName !== undefined) row.legalName = this.emptyToNull(dto.legalName);
    if (dto.tagline !== undefined) row.tagline = this.emptyToNull(dto.tagline);
    if (dto.email !== undefined) row.email = this.emptyToNull(dto.email);
    if (dto.phone !== undefined) row.phone = this.emptyToNull(dto.phone);
    if (dto.website !== undefined) row.website = this.emptyToNull(dto.website);
    if (dto.address !== undefined) row.address = this.emptyToNull(dto.address);
    if (dto.taxId !== undefined) row.taxId = this.emptyToNull(dto.taxId);
    if (dto.registrationNumber !== undefined) {
      row.registrationNumber = this.emptyToNull(dto.registrationNumber);
    }
    if (dto.invoiceHeaderText !== undefined) {
      row.invoiceHeaderText = this.emptyToNull(dto.invoiceHeaderText);
    }
    if (dto.invoiceFooterText !== undefined) {
      row.invoiceFooterText = this.emptyToNull(dto.invoiceFooterText);
    }
    if (dto.termsAndConditions !== undefined) {
      row.termsAndConditions = this.emptyToNull(dto.termsAndConditions);
    }
    if (dto.bankDetails !== undefined) {
      row.bankDetails = this.emptyToNull(dto.bankDetails);
    }

    await this.repo.save(row);
    return this.toResponse(row, requestBaseUrl);
  }

  async uploadLogo(
    file: Express.Multer.File | undefined,
    requestBaseUrl?: string,
    variant: LogoVariant = 'light',
  ) {
    if (!file) throw new BadRequestException('File is required');
    if (file.size > MAX_BYTES) {
      throw new BadRequestException('Image must be 5 MB or smaller');
    }
    const ext = ALLOWED_MIME[file.mimetype];
    if (!ext) {
      throw new BadRequestException(
        'Logo must be PNG (recommended), JPEG, WebP, or GIF',
      );
    }

    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }

    const row = await this.getRow();
    const previous =
      variant === 'dark'
        ? row.logoDarkPath
        : this.resolvedLightPath(row);

    const filename = `logo-${variant}-${randomUUID()}${ext}`;
    const diskPath = join(this.uploadDir, filename);
    writeFileSync(diskPath, file.buffer);
    const stored = `/uploads/branding/${filename}`;

    if (variant === 'dark') {
      row.logoDarkPath = stored;
    } else {
      row.logoLightPath = stored;
      row.heroImagePath = stored;
    }

    await this.repo.save(row);
    if (previous && previous !== stored) this.deleteLogoFile(previous);
    return this.toResponse(row, requestBaseUrl);
  }

  /** @deprecated Prefer uploadLogo */
  async uploadHeroImage(
    file: Express.Multer.File | undefined,
    requestBaseUrl?: string,
  ) {
    return this.uploadLogo(file, requestBaseUrl, 'light');
  }

  async clearLogo(
    requestBaseUrl?: string,
    variant: LogoVariant = 'light',
  ) {
    const row = await this.getRow();
    if (variant === 'dark') {
      this.deleteLogoFile(row.logoDarkPath);
      row.logoDarkPath = null;
    } else {
      this.deleteLogoFile(row.logoLightPath);
      this.deleteLogoFile(row.heroImagePath);
      row.logoLightPath = null;
      row.heroImagePath = null;
    }
    await this.repo.save(row);
    return this.toResponse(row, requestBaseUrl);
  }

  /** @deprecated Prefer clearLogo */
  async clearHeroImage(requestBaseUrl?: string) {
    return this.clearLogo(requestBaseUrl, 'light');
  }

  private deleteLogoFile(storedPath: string | null) {
    if (!storedPath) return;
    const match = storedPath.match(/\/uploads\/branding\/([^/]+)$/);
    if (!match) return;
    const diskPath = join(this.uploadDir, match[1]);
    if (existsSync(diskPath)) {
      try {
        unlinkSync(diskPath);
      } catch {
        // ignore missing/locked file
      }
    }
  }

  private async ensureCommissionTable() {
    await this.dataSource.query(`
      DO $$ BEGIN
        CREATE TYPE "sales_commission_basis_enum" AS ENUM ('PROFIT', 'SALES');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$
    `);
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS "commission_settings" (
        "id" character varying(32) NOT NULL DEFAULT 'default',
        "enabled" boolean NOT NULL DEFAULT true,
        "default_percent" numeric(5,2) NOT NULL DEFAULT 10,
        "default_basis" "sales_commission_basis_enum" NOT NULL DEFAULT 'PROFIT',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_commission_settings" PRIMARY KEY ("id")
      )
    `);
  }

  async ensureCommissionSettings(): Promise<CommissionSettings> {
    try {
      await this.ensureCommissionTable();
      let row = await this.commissionRepo.findOne({
        where: { id: COMMISSION_SETTINGS_ID },
      });
      if (!row) {
        row = await this.commissionRepo.save(
          this.commissionRepo.create({
            id: COMMISSION_SETTINGS_ID,
            enabled: true,
            defaultPercent: DEFAULT_COMMISSION_PERCENT.toFixed(2),
            defaultBasis: CommissionBasis.PROFIT,
          }),
        );
      }
      return row;
    } catch (err) {
      this.logger.error(
        'Failed to ensure commission_settings row; run migration:run',
        err instanceof Error ? err.stack : err,
      );
      throw err;
    }
  }

  private toCommissionView(row: CommissionSettings): CommissionSettingsView {
    return {
      id: row.id,
      enabled: row.enabled,
      defaultPercent: parseFloat(row.defaultPercent),
      defaultBasis: row.defaultBasis,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toCommissionDefaults(row: CommissionSettings): CommissionDefaultsView {
    return {
      enabled: row.enabled,
      defaultPercent: parseFloat(row.defaultPercent),
      defaultBasis: row.defaultBasis,
    };
  }

  async getCommissionSettings(): Promise<CommissionSettingsView> {
    const row = await this.ensureCommissionSettings();
    return this.toCommissionView(row);
  }

  async getCommissionDefaults(): Promise<CommissionDefaultsView> {
    const row = await this.ensureCommissionSettings();
    return this.toCommissionDefaults(row);
  }

  /** Raw settings for sale commission calculation. */
  async getCommissionPlan(): Promise<CommissionSettings> {
    return this.ensureCommissionSettings();
  }

  async updateCommissionSettings(
    dto: UpdateCommissionSettingsDto,
  ): Promise<CommissionSettingsView> {
    const row = await this.ensureCommissionSettings();
    if (dto.enabled !== undefined) row.enabled = dto.enabled;
    if (dto.defaultPercent !== undefined) {
      row.defaultPercent = dto.defaultPercent.toFixed(2);
    }
    if (dto.defaultBasis !== undefined) row.defaultBasis = dto.defaultBasis;
    const saved = await this.commissionRepo.save(row);
    return this.toCommissionView(saved);
  }

  private async ensureTaxTable() {
    await this.dataSource.query(`
      DO $$ BEGIN
        CREATE TYPE "tax_mode_enum" AS ENUM ('EXCLUSIVE', 'INCLUSIVE');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$
    `);
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS "tax_settings" (
        "id" character varying(32) NOT NULL DEFAULT 'default',
        "enabled" boolean NOT NULL DEFAULT false,
        "default_percent" numeric(5,2) NOT NULL DEFAULT 0,
        "default_mode" "tax_mode_enum" NOT NULL DEFAULT 'EXCLUSIVE',
        "apply_to_sales" boolean NOT NULL DEFAULT true,
        "apply_to_purchases" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tax_settings" PRIMARY KEY ("id")
      )
    `);
  }

  async ensureTaxSettings(): Promise<TaxSettings> {
    try {
      await this.ensureTaxTable();
      let row = await this.taxRepo.findOne({
        where: { id: TAX_SETTINGS_ID },
      });
      if (!row) {
        row = await this.taxRepo.save(
          this.taxRepo.create({
            id: TAX_SETTINGS_ID,
            enabled: false,
            defaultPercent: '0.00',
            defaultMode: TaxMode.EXCLUSIVE,
            applyToSales: true,
            applyToPurchases: true,
          }),
        );
      }
      return row;
    } catch (err) {
      this.logger.error(
        'Failed to ensure tax_settings row; run migration:run',
        err instanceof Error ? err.stack : err,
      );
      throw err;
    }
  }

  private toTaxView(row: TaxSettings): TaxSettingsView {
    return {
      id: row.id,
      enabled: row.enabled,
      defaultPercent: parseFloat(row.defaultPercent),
      defaultMode: row.defaultMode,
      applyToSales: row.applyToSales,
      applyToPurchases: row.applyToPurchases,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toTaxDefaults(row: TaxSettings): TaxDefaultsView {
    return {
      enabled: row.enabled,
      defaultPercent: parseFloat(row.defaultPercent),
      defaultMode: row.defaultMode,
      applyToSales: row.applyToSales,
      applyToPurchases: row.applyToPurchases,
    };
  }

  async getTaxSettings(): Promise<TaxSettingsView> {
    const row = await this.ensureTaxSettings();
    return this.toTaxView(row);
  }

  async getTaxDefaults(): Promise<TaxDefaultsView> {
    const row = await this.ensureTaxSettings();
    return this.toTaxDefaults(row);
  }

  async getTaxPlan(): Promise<TaxSettings> {
    return this.ensureTaxSettings();
  }

  async updateTaxSettings(
    dto: UpdateTaxSettingsDto,
  ): Promise<TaxSettingsView> {
    const row = await this.ensureTaxSettings();
    if (dto.enabled !== undefined) row.enabled = dto.enabled;
    if (dto.defaultPercent !== undefined) {
      row.defaultPercent = dto.defaultPercent.toFixed(2);
    }
    if (dto.defaultMode !== undefined) row.defaultMode = dto.defaultMode;
    if (dto.applyToSales !== undefined) row.applyToSales = dto.applyToSales;
    if (dto.applyToPurchases !== undefined) {
      row.applyToPurchases = dto.applyToPurchases;
    }
    const saved = await this.taxRepo.save(row);
    return this.toTaxView(saved);
  }
}
