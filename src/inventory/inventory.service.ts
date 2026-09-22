import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { DataSource, Not, Repository } from 'typeorm';
import {
  ItemType,
  StockAdjustmentDirection,
  StockAdjustmentReason,
} from '../common/enums';
import {
  absoluteMediaUrl,
  publicBaseFromConfig,
} from '../common/utils/media-url.util';
import {
  applyDateRangeToQb,
  applyIlikeSearch,
  applyRelatedIlikeSearch,
  paginatedQueryBuilder,
  sumFilteredQueryBuilder,
} from '../common/utils/query.util';
import { Item } from '../database/entities/item.entity';
import { Location } from '../database/entities/location.entity';
import { StockAdjustment } from '../database/entities/stock-adjustment.entity';
import { StockLevel } from '../database/entities/stock-level.entity';
import { StockService } from './stock.service';
import { LowStockService } from '../notifications/low-stock.service';
import { CreateInventoryDto, UpdateInventoryDto } from './dto/inventory.dto';
import { InventoryListQueryDto } from './dto/inventory-list-query.dto';
import {
  CreateStockAdjustmentDto,
  StockAdjustmentListQueryDto,
} from './dto/stock-adjustment.dto';
import type {
  UploadedExcelFile,
  UploadedImageFile,
} from './dto/uploaded-file.interface';

const ITEM_IMAGE_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const ITEM_IMAGE_EXT_MIME: Record<string, string> = {
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

const ITEM_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

@Injectable()
export class InventoryService {
  private readonly itemUploadDir = join(process.cwd(), 'uploads', 'items');

  constructor(
    @InjectRepository(StockLevel)
    private readonly stockRepo: Repository<StockLevel>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    @InjectRepository(StockAdjustment)
    private readonly adjustmentRepo: Repository<StockAdjustment>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly stockService: StockService,
    private readonly lowStockService: LowStockService,
    private readonly config: ConfigService,
  ) {}

  private mediaBase(requestBaseUrl?: string) {
    return {
      publicBaseUrl: publicBaseFromConfig(this.config),
      requestBaseUrl,
    };
  }

  private attachItemImageUrl<
    T extends {
      item?: {
        imagePath?: string | null;
        imageUrl?: string | null;
      } | null;
    },
  >(row: T, requestBaseUrl?: string): T {
    if (row.item) {
      row.item.imageUrl = absoluteMediaUrl(
        row.item.imagePath ?? null,
        this.mediaBase(requestBaseUrl),
      );
    }
    return row;
  }

  private attachItemImageUrls<
    T extends {
      item?: {
        imagePath?: string | null;
        imageUrl?: string | null;
      } | null;
    },
  >(rows: T[], requestBaseUrl?: string): T[] {
    return rows.map((row) => this.attachItemImageUrl(row, requestBaseUrl));
  }

  async findAll(query: InventoryListQueryDto, requestBaseUrl?: string) {
    const filteredQb = this.buildInventoryFilterQb(query);
    const [totals, page] = await Promise.all([
      sumFilteredQueryBuilder(filteredQb, [
        {
          key: 'quantity',
          sql: 'COALESCE(SUM(stock.quantity::numeric), 0)',
          decimals: 3,
        },
        {
          key: 'inventoryValue',
          sql: 'COALESCE(SUM(stock.quantity::numeric * stock.purchase_price::numeric), 0)',
        },
      ]),
      paginatedQueryBuilder(
        filteredQb
          .clone()
          .leftJoinAndSelect('stock.item', 'item')
          .leftJoinAndSelect('stock.location', 'location')
          .orderBy('stock.updated_at', 'DESC'),
        query.page,
        query.limit,
      ),
    ]);

    return {
      ...page,
      data: this.attachItemImageUrls(page.data, requestBaseUrl),
      totals,
    };
  }
  private buildInventoryFilterQb(query: InventoryListQueryDto) {
    const qb = this.stockRepo.createQueryBuilder('stock');

    if (query.locationId) {
      qb.andWhere('stock.location_id = :locationId', {
        locationId: query.locationId,
      });
    }
    applyRelatedIlikeSearch(qb, query.search, [], {
      table: 'items',
      alias: 'item_filter',
      parentKey: 'stock.item_id',
      relatedKey: 'id',
      columns: ['description', 'sku'],
    });

    return qb;
  }

  async findLowStock(
    query: {
      locationId?: string;
      page?: number;
      limit?: number;
    },
    requestBaseUrl?: string,
  ) {
    const page = await this.lowStockService.findAllLowStock(query);
    return {
      ...page,
      data: this.attachItemImageUrls(page.data, requestBaseUrl),
    };
  }

  async findOne(id: string, requestBaseUrl?: string) {
    const stock = await this.stockRepo.findOne({
      where: { id },
      relations: { item: true, location: true },
    });
    if (!stock) throw new NotFoundException('Inventory record not found');
    return this.attachItemImageUrl(stock, requestBaseUrl);
  }

  async create(dto: CreateInventoryDto, requestBaseUrl?: string) {
    await this.ensureLocation(dto.locationId);
    let item = dto.sku
      ? await this.itemRepo.findOne({ where: { sku: dto.sku } })
      : null;
    if (!item) {
      item = await this.itemRepo.save(
        this.itemRepo.create({
          sku: dto.sku ?? null,
          description: dto.description,
          unit: dto.unit ?? null,
          itemType: dto.itemType,
        }),
      );
    }

    const existing = await this.stockService.getStock(dto.locationId, item.id);
    if (existing) {
      const adjusted = await this.stockService.adjust({
        locationId: dto.locationId,
        itemId: item.id,
        quantityDelta: dto.quantity,
        purchasePrice: dto.purchasePrice,
      });
      if (dto.reorderPoint !== undefined) {
        adjusted.reorderPoint = dto.reorderPoint.toFixed(3);
        const saved = await this.stockRepo.save(adjusted);
        await this.lowStockService.evaluateAfterReorderPointChange(saved.id);
        return this.findOne(saved.id, requestBaseUrl);
      }
      return this.findOne(adjusted.id, requestBaseUrl);
    }

    const saved = await this.stockRepo.save(
      this.stockRepo.create({
        locationId: dto.locationId,
        itemId: item.id,
        quantity: dto.quantity.toFixed(3),
        purchasePrice: dto.purchasePrice.toFixed(2),
        reorderPoint:
          dto.reorderPoint !== undefined ? dto.reorderPoint.toFixed(3) : null,
      }),
    );
    await this.lowStockService.evaluateInitialStock(saved.id);
    return this.findOne(saved.id, requestBaseUrl);
  }

  async update(
    id: string,
    dto: UpdateInventoryDto,
    requestBaseUrl?: string,
  ) {
    const stock = await this.findOne(id, requestBaseUrl);

    const itemChanged =
      dto.description !== undefined ||
      dto.sku !== undefined ||
      dto.unit !== undefined ||
      dto.itemType !== undefined;

    if (itemChanged) {
      if (dto.description !== undefined) {
        const description = dto.description.trim();
        if (!description) {
          throw new BadRequestException('description cannot be empty');
        }
        stock.item.description = description;
      }
      if (dto.sku !== undefined) {
        const sku =
          dto.sku === null || dto.sku.trim() === '' ? null : dto.sku.trim();
        if (sku) {
          const existing = await this.itemRepo.findOne({
            where: { sku, id: Not(stock.itemId) },
          });
          if (existing) {
            throw new ConflictException('SKU already in use by another item');
          }
        }
        stock.item.sku = sku;
      }
      if (dto.unit !== undefined) {
        stock.item.unit =
          dto.unit === null || dto.unit.trim() === '' ? null : dto.unit.trim();
      }
      if (dto.itemType !== undefined) {
        stock.item.itemType = dto.itemType;
      }
      await this.itemRepo.save(stock.item);
    }

    if (dto.purchasePrice !== undefined) {
      stock.purchasePrice = dto.purchasePrice.toFixed(2);
    }
    if (dto.reorderPoint !== undefined) {
      stock.reorderPoint =
        dto.reorderPoint === null ? null : dto.reorderPoint.toFixed(3);
    }
    const saved = await this.stockRepo.save(stock);

    if (dto.reorderPoint !== undefined) {
      await this.lowStockService.evaluateAfterReorderPointChange(saved.id);
    }

    return this.findOne(saved.id, requestBaseUrl);
  }

  async uploadItemImage(
    stockId: string,
    file: UploadedImageFile | undefined,
    requestBaseUrl?: string,
  ) {
    if (!file) throw new BadRequestException('File is required');
    if (file.size > ITEM_IMAGE_MAX_BYTES) {
      throw new BadRequestException('Image must be 5 MB or smaller');
    }
    const ext = ITEM_IMAGE_MIME[file.mimetype];
    if (!ext) {
      throw new BadRequestException(
        'Image must be JPEG, PNG, WebP, or GIF',
      );
    }

    const stock = await this.findOne(stockId, requestBaseUrl);
    if (!existsSync(this.itemUploadDir)) {
      mkdirSync(this.itemUploadDir, { recursive: true });
    }

    this.deleteItemImageFile(stock.item.imagePath);

    const filename = `item-${randomUUID()}${ext}`;
    writeFileSync(join(this.itemUploadDir, filename), file.buffer);
    stock.item.imagePath = `/uploads/items/${filename}`;
    await this.itemRepo.save(stock.item);

    return this.findOne(stockId, requestBaseUrl);
  }

  async clearItemImage(stockId: string, requestBaseUrl?: string) {
    const stock = await this.findOne(stockId, requestBaseUrl);
    this.deleteItemImageFile(stock.item.imagePath);
    stock.item.imagePath = null;
    await this.itemRepo.save(stock.item);
    return this.findOne(stockId, requestBaseUrl);
  }

  private deleteItemImageFile(storedPath: string | null | undefined) {
    if (!storedPath) return;
    const match = storedPath.match(/\/uploads\/items\/([^/]+)$/);
    if (!match) return;
    const diskPath = join(this.itemUploadDir, match[1]);
    if (existsSync(diskPath)) {
      try {
        unlinkSync(diskPath);
      } catch {
        // ignore missing/locked file
      }
    }
  }

  async findAdjustments(
    query: StockAdjustmentListQueryDto,
    requestBaseUrl?: string,
  ) {
    const qb = this.adjustmentRepo
      .createQueryBuilder('adj')
      .leftJoinAndSelect('adj.item', 'item')
      .leftJoinAndSelect('adj.location', 'location')
      .leftJoinAndSelect('adj.createdBy', 'createdBy')
      .orderBy('adj.created_at', 'DESC');

    if (query.locationId) {
      qb.andWhere('adj.location_id = :locationId', {
        locationId: query.locationId,
      });
    }
    if (query.itemId) {
      qb.andWhere('adj.item_id = :itemId', { itemId: query.itemId });
    }
    if (query.direction) {
      qb.andWhere('adj.direction = :direction', {
        direction: query.direction,
      });
    }
    if (query.reason) {
      qb.andWhere('adj.reason = :reason', { reason: query.reason });
    }
    applyIlikeSearch(qb, query.search, [
      'adj.notes',
      'adj.reference',
      'item.description',
      'item.sku',
    ]);
    applyDateRangeToQb(qb, 'adj.created_at', query.from, query.to);

    const page = await paginatedQueryBuilder(qb, query.page, query.limit);
    return {
      ...page,
      data: this.attachItemImageUrls(page.data, requestBaseUrl),
    };
  }

  async createAdjustment(dto: CreateStockAdjustmentDto, userId?: string) {
    await this.ensureLocation(dto.locationId);
    const item = await this.itemRepo.findOne({ where: { id: dto.itemId } });
    if (!item) throw new BadRequestException('Item not found');

    if (
      dto.direction === StockAdjustmentDirection.OUT &&
      (dto.reason === StockAdjustmentReason.FOUND ||
        dto.reason === StockAdjustmentReason.OPENING)
    ) {
      throw new BadRequestException(
        `${dto.reason} adjustments must use direction "in"`,
      );
    }
    if (
      dto.direction === StockAdjustmentDirection.IN &&
      (dto.reason === StockAdjustmentReason.DAMAGE ||
        dto.reason === StockAdjustmentReason.LOSS)
    ) {
      throw new BadRequestException(
        `${dto.reason} adjustments must use direction "out"`,
      );
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const adjustmentRepo = manager.getRepository(StockAdjustment);
      const quantityBefore = await this.stockService.getQuantity(
        dto.locationId,
        dto.itemId,
        manager,
      );

      const delta =
        dto.direction === StockAdjustmentDirection.IN
          ? Math.abs(dto.quantity)
          : -Math.abs(dto.quantity);

      if (dto.direction === StockAdjustmentDirection.OUT) {
        if (quantityBefore < Math.abs(dto.quantity)) {
          throw new BadRequestException(
            `Insufficient stock for adjustment. Available: ${quantityBefore}, requested: ${dto.quantity}`,
          );
        }
      }

      await this.stockService.adjust(
        {
          locationId: dto.locationId,
          itemId: dto.itemId,
          quantityDelta: delta,
          purchasePrice:
            dto.direction === StockAdjustmentDirection.IN
              ? dto.purchasePrice
              : undefined,
        },
        manager,
      );

      const quantityAfter = quantityBefore + delta;
      const saved = await adjustmentRepo.save(
        adjustmentRepo.create({
          locationId: dto.locationId,
          itemId: dto.itemId,
          direction: dto.direction,
          quantity: Math.abs(dto.quantity).toFixed(3),
          quantityBefore: quantityBefore.toFixed(3),
          quantityAfter: quantityAfter.toFixed(3),
          reason: dto.reason,
          notes: dto.notes?.trim() || null,
          reference: dto.reference?.trim() || null,
          createdById: userId ?? null,
        }),
      );
      return { id: saved.id, quantityBefore };
    });

    await this.lowStockService.evaluate(
      dto.locationId,
      dto.itemId,
      result.quantityBefore,
    );

    return this.adjustmentRepo.findOne({
      where: { id: result.id },
      relations: { item: true, location: true, createdBy: true },
    });
  }

  async remove(id: string) {
    const stock = await this.findOne(id);
    await this.stockRepo.remove(stock);
    return { success: true };
  }

  async bulkImport(locationId: string, file: UploadedExcelFile) {
    await this.ensureLocation(locationId);
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    const embeddedByExcelRow = await this.loadEmbeddedImagesByExcelRow(
      file.buffer,
    );

    const results: { row: number; status: string; id?: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const excelRow = i + 2;
      const description = String(
        row.description ?? row.Description ?? row.item ?? '',
      ).trim();
      const quantity = parseFloat(
        String(row.quantity ?? row.Quantity ?? row.qty ?? 0),
      );
      const purchasePrice = parseFloat(
        String(
          row.purchasePrice ??
            row.purchase_price ??
            row.price ??
            row.PurchasePrice ??
            0,
        ),
      );
      const reorderPointRaw = row.reorderPoint ?? row.reorder_point;
      const reorderPoint =
        reorderPointRaw !== undefined && reorderPointRaw !== ''
          ? parseFloat(String(reorderPointRaw))
          : undefined;
      const imageUrlRaw = String(
        row.imageUrl ?? row.image_url ?? row.ImageUrl ?? '',
      ).trim();
      const itemTypeRaw = String(
        row.itemType ?? row.item_type ?? row.ItemType ?? '',
      )
        .trim()
        .toUpperCase();
      const itemType = Object.values(ItemType).includes(itemTypeRaw as ItemType)
        ? (itemTypeRaw as ItemType)
        : undefined;

      if (!description || Number.isNaN(quantity)) {
        results.push({ row: excelRow, status: 'skipped: invalid row' });
        continue;
      }

      try {
        const saved = await this.create({
          description,
          locationId,
          quantity,
          purchasePrice: Number.isNaN(purchasePrice) ? 0 : purchasePrice,
          sku: row.sku ? String(row.sku) : undefined,
          itemType,
          reorderPoint:
            reorderPoint !== undefined && !Number.isNaN(reorderPoint)
              ? reorderPoint
              : undefined,
        });

        let status = 'imported';
        const embedded = embeddedByExcelRow.get(excelRow);
        if (embedded) {
          try {
            await this.uploadItemImage(saved.id, embedded);
            status = 'imported+image';
          } catch (imgErr) {
            status = `imported (image failed: ${exceptionMessage(imgErr)})`;
          }
        } else if (imageUrlRaw) {
          try {
            await this.attachImageFromUrl(saved.id, imageUrlRaw);
            status = 'imported+image';
          } catch (imgErr) {
            status = `imported (image failed: ${exceptionMessage(imgErr)})`;
          }
        }

        results.push({ row: excelRow, status, id: saved.id });
      } catch (e) {
        results.push({
          row: excelRow,
          status: `error: ${exceptionMessage(e)}`,
        });
      }
    }

    return {
      imported: results.filter((r) => r.status.startsWith('imported')).length,
      results,
    };
  }

  /**
   * Map floating pictures in the first sheet to Excel row numbers (1-based).
   * Header is row 1; first data row is 2. Only .xlsx is supported.
   * Handles both standard pictures (xdr:pic) and shape image fills (xdr:sp + blipFill),
   * which Excel often writes when pasting photos into cells.
   */
  private async loadEmbeddedImagesByExcelRow(
    buffer: Buffer,
  ): Promise<Map<number, UploadedImageFile>> {
    const byRow = new Map<number, UploadedImageFile>();
    try {
      const zip = await JSZip.loadAsync(buffer);
      const sheetPath = await resolveFirstWorksheetPath(zip);
      if (!sheetPath) return byRow;

      const sheetRelsPath = worksheetRelsPath(sheetPath);
      const sheetRelsXml = await zip.file(sheetRelsPath)?.async('string');
      if (!sheetRelsXml) return byRow;

      const drawingRel = [...sheetRelsXml.matchAll(REL_HREF_RE)].find((m) =>
        m[2].includes('/relationships/drawing'),
      );
      if (!drawingRel) return byRow;

      const drawingPath = resolveZipPath(sheetPath, drawingRel[3]);
      const drawingXml = await zip.file(drawingPath)?.async('string');
      const drawingRelsXml = await zip
        .file(relsPathFor(drawingPath))
        ?.async('string');
      if (!drawingXml || !drawingRelsXml) return byRow;

      const rIdToMedia = new Map<string, string>();
      for (const m of drawingRelsXml.matchAll(REL_HREF_RE)) {
        if (!m[2].includes('/relationships/image')) continue;
        rIdToMedia.set(m[1], resolveZipPath(drawingPath, m[3]));
      }

      for (const anchor of drawingXml.matchAll(DRAWING_ANCHOR_RE)) {
        const block = anchor[0];
        const rowMatch = block.match(/<xdr:row>(\d+)<\/xdr:row>/);
        const embedMatch = block.match(/r:embed="([^"]+)"/);
        if (!rowMatch || !embedMatch) continue;

        const excelRow = Number(rowMatch[1]) + 1;
        if (!Number.isFinite(excelRow) || excelRow < 2 || byRow.has(excelRow)) {
          continue;
        }

        const mediaPath = rIdToMedia.get(embedMatch[1]);
        if (!mediaPath) continue;

        const ext = mediaPath.split('.').pop()?.toLowerCase() ?? '';
        const mimetype = ITEM_IMAGE_EXT_MIME[ext];
        if (!mimetype) continue;

        const imageBuffer = Buffer.from(
          await zip.file(mediaPath)!.async('nodebuffer'),
        );
        if (imageBuffer.byteLength > ITEM_IMAGE_MAX_BYTES) continue;

        byRow.set(excelRow, {
          buffer: imageBuffer,
          mimetype,
          size: imageBuffer.byteLength,
        });
      }
    } catch {
      // .xls / .csv / malformed zip — ignore embedded images
    }
    return byRow;
  }

  /** Download a public image URL and attach it to the stock row's catalog item. */
  private async attachImageFromUrl(stockId: string, imageUrl: string) {
    let parsed: URL;
    try {
      parsed = new URL(imageUrl);
    } catch {
      throw new BadRequestException('Invalid image URL');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException('imageUrl must be http or https');
    }
    if (isBlockedImageHost(parsed.hostname)) {
      throw new BadRequestException('imageUrl host is not allowed');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let response: Response;
    try {
      response = await fetch(parsed.toString(), {
        signal: controller.signal,
        redirect: 'follow',
        headers: { Accept: 'image/*' },
      });
    } catch {
      throw new BadRequestException('Failed to download image');
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new BadRequestException(
        `Image download failed (${response.status})`,
      );
    }

    const contentType = (response.headers.get('content-type') ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (!ITEM_IMAGE_MIME[contentType]) {
      throw new BadRequestException(
        'Remote file must be JPEG, PNG, WebP, or GIF',
      );
    }

    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > ITEM_IMAGE_MAX_BYTES) {
      throw new BadRequestException('Image must be 5 MB or smaller');
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > ITEM_IMAGE_MAX_BYTES) {
      throw new BadRequestException('Image must be 5 MB or smaller');
    }

    await this.uploadItemImage(stockId, {
      buffer: Buffer.from(arrayBuffer),
      mimetype: contentType,
      size: arrayBuffer.byteLength,
    });
  }

  private async ensureLocation(locationId: string) {
    const loc = await this.locationRepo.findOne({ where: { id: locationId } });
    if (!loc) throw new BadRequestException('Location not found');
  }
}

function exceptionMessage(err: unknown): string {
  if (err instanceof BadRequestException) {
    const res = err.getResponse();
    if (typeof res === 'string') return res;
    if (typeof res === 'object' && res && 'message' in res) {
      const message = (res as { message: string | string[] }).message;
      return Array.isArray(message) ? message.join(', ') : String(message);
    }
  }
  if (err instanceof Error) return err.message;
  return 'unknown';
}

function isBlockedImageHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host === 'metadata.google.internal' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }

  if (host.includes(':')) {
    // IPv6: block loopback / link-local / ULA
    return (
      host === '::1' ||
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('fe80')
    );
  }

  const parts = host.split('.').map((p) => Number(p));
  if (parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }

  return false;
}

const REL_HREF_RE =
  /<Relationship[^>]*\bId="([^"]+)"[^>]*\bType="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/>/g;
const DRAWING_ANCHOR_RE =
  /<xdr:(?:twoCellAnchor|oneCellAnchor)[^>]*>[\s\S]*?<\/xdr:(?:twoCellAnchor|oneCellAnchor)>/g;

async function resolveFirstWorksheetPath(
  zip: JSZip,
): Promise<string | undefined> {
  const workbookXml = await zip.file('xl/workbook.xml')?.async('string');
  const workbookRels = await zip
    .file('xl/_rels/workbook.xml.rels')
    ?.async('string');
  if (!workbookXml || !workbookRels) {
    return zip.file('xl/worksheets/sheet1.xml')
      ? 'xl/worksheets/sheet1.xml'
      : undefined;
  }

  const firstSheet = workbookXml.match(
    /<sheet[^>]*\br:id="([^"]+)"[^>]*\/?>/,
  );
  if (!firstSheet) {
    return zip.file('xl/worksheets/sheet1.xml')
      ? 'xl/worksheets/sheet1.xml'
      : undefined;
  }

  for (const m of workbookRels.matchAll(REL_HREF_RE)) {
    if (m[1] === firstSheet[1]) {
      return resolveZipPath('xl/workbook.xml', m[3]);
    }
  }
  return undefined;
}

function worksheetRelsPath(sheetPath: string): string {
  return relsPathFor(sheetPath);
}

function relsPathFor(partPath: string): string {
  const parts = partPath.split('/');
  const file = parts.pop()!;
  return `${parts.join('/')}/_rels/${file}.rels`;
}

function resolveZipPath(fromPath: string, target: string): string {
  if (target.startsWith('/')) return target.replace(/^\//, '');
  const baseParts = fromPath.split('/');
  baseParts.pop();
  for (const part of target.split('/')) {
    if (part === '.' || part === '') continue;
    if (part === '..') baseParts.pop();
    else baseParts.push(part);
  }
  return baseParts.join('/');
}
