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
import { CommissionBasis, DEFAULT_COMMISSION_PERCENT } from '../common/enums';
import {
  COMMISSION_SETTINGS_ID,
  CommissionSettings,
} from '../database/entities/commission-settings.entity';
import { SiteBranding } from '../database/entities/site-branding.entity';
import { BrandingResponse, UpdateBrandingDto } from './dto/branding.dto';
import {
  CommissionDefaultsView,
  CommissionSettingsView,
  UpdateCommissionSettingsDto,
} from './dto/commission-settings.dto';

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
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.ensureRow();
    await this.ensureCommissionSettings();
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
        "headline" character varying(160),
        "supporting_text" character varying(400),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_site_branding" PRIMARY KEY ("id")
      )
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
            headline: null,
            supportingText: null,
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

  private absoluteHeroUrl(
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

  private toResponse(
    row: SiteBranding,
    requestBaseUrl?: string,
  ): BrandingResponse {
    return {
      appName: row.appName,
      heroImageUrl: this.absoluteHeroUrl(row.heroImagePath, requestBaseUrl),
      headline: row.headline,
      supportingText: row.supportingText,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async getBranding(requestBaseUrl?: string) {
    const row = await this.getRow();
    return this.toResponse(row, requestBaseUrl);
  }

  async updateBranding(dto: UpdateBrandingDto, requestBaseUrl?: string) {
    const row = await this.getRow();

    if (dto.appName !== undefined) {
      const name = dto.appName.trim();
      if (!name) throw new BadRequestException('appName cannot be empty');
      row.appName = name;
    }
    if (dto.headline !== undefined) {
      const v = dto.headline.trim();
      row.headline = v.length ? v : null;
    }
    if (dto.supportingText !== undefined) {
      const v = dto.supportingText.trim();
      row.supportingText = v.length ? v : null;
    }

    await this.repo.save(row);
    return this.toResponse(row, requestBaseUrl);
  }

  async uploadHeroImage(
    file: Express.Multer.File | undefined,
    requestBaseUrl?: string,
  ) {
    if (!file) throw new BadRequestException('File is required');
    if (file.size > MAX_BYTES) {
      throw new BadRequestException('Image must be 5 MB or smaller');
    }
    const ext = ALLOWED_MIME[file.mimetype];
    if (!ext) {
      throw new BadRequestException('Image must be JPEG, PNG, WebP, or GIF');
    }

    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }

    const row = await this.getRow();
    this.deleteHeroFile(row.heroImagePath);

    const filename = `hero-${randomUUID()}${ext}`;
    const diskPath = join(this.uploadDir, filename);
    writeFileSync(diskPath, file.buffer);

    row.heroImagePath = `/uploads/branding/${filename}`;
    await this.repo.save(row);
    return this.toResponse(row, requestBaseUrl);
  }

  async clearHeroImage(requestBaseUrl?: string) {
    const row = await this.getRow();
    this.deleteHeroFile(row.heroImagePath);
    row.heroImagePath = null;
    await this.repo.save(row);
    return this.toResponse(row, requestBaseUrl);
  }

  private deleteHeroFile(storedPath: string | null) {
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
}
