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
import { SiteBranding } from '../database/entities/site-branding.entity';
import { BrandingResponse, UpdateBrandingDto } from './dto/branding.dto';

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
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.ensureRow();
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
}
