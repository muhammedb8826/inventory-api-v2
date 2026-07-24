import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as XLSX from 'xlsx';
import { DataSource, Not, Repository } from 'typeorm';
import {
  StockAdjustmentDirection,
  StockAdjustmentReason,
} from '../common/enums';
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
import type { UploadedExcelFile } from './dto/uploaded-file.interface';

@Injectable()
export class InventoryService {
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
  ) {}

  async findAll(query: InventoryListQueryDto) {
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

    return { ...page, totals };
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

  async findLowStock(query: {
    locationId?: string;
    page?: number;
    limit?: number;
  }) {
    return this.lowStockService.findAllLowStock(query);
  }

  async findOne(id: string) {
    const stock = await this.stockRepo.findOne({
      where: { id },
      relations: { item: true, location: true },
    });
    if (!stock) throw new NotFoundException('Inventory record not found');
    return stock;
  }

  async create(dto: CreateInventoryDto) {
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
        return saved;
      }
      return adjusted;
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
    return saved;
  }

  async update(id: string, dto: UpdateInventoryDto) {
    const stock = await this.findOne(id);

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

    return saved;
  }

  async findAdjustments(query: StockAdjustmentListQueryDto) {
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

    return paginatedQueryBuilder(qb, query.page, query.limit);
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

    const results: { row: number; status: string; id?: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
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

      if (!description || Number.isNaN(quantity)) {
        results.push({ row: i + 2, status: 'skipped: invalid row' });
        continue;
      }

      try {
        const saved = await this.create({
          description,
          locationId,
          quantity,
          purchasePrice: Number.isNaN(purchasePrice) ? 0 : purchasePrice,
          sku: row.sku ? String(row.sku) : undefined,
          reorderPoint:
            reorderPoint !== undefined && !Number.isNaN(reorderPoint)
              ? reorderPoint
              : undefined,
        });
        results.push({ row: i + 2, status: 'imported', id: saved.id });
      } catch (e) {
        results.push({
          row: i + 2,
          status: `error: ${e instanceof Error ? e.message : 'unknown'}`,
        });
      }
    }

    return {
      imported: results.filter((r) => r.status === 'imported').length,
      results,
    };
  }

  private async ensureLocation(locationId: string) {
    const loc = await this.locationRepo.findOne({ where: { id: locationId } });
    if (!loc) throw new BadRequestException('Location not found');
  }
}
