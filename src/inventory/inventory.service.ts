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
import { DataSource, In, Not, Repository } from 'typeorm';
import {
  ItemType,
  StockAdjustmentDirection,
  StockAdjustmentReason,
  StockMovementRefType,
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
import { ItemAttributeValue } from '../database/entities/item-attribute-value.entity';
import { Location } from '../database/entities/location.entity';
import { ProductAttributeValue } from '../database/entities/product-attribute-value.entity';
import { StockAdjustment } from '../database/entities/stock-adjustment.entity';
import { StockLevel } from '../database/entities/stock-level.entity';
import { StockMovement } from '../database/entities/stock-movement.entity';
import { StockService } from './stock.service';
import { LowStockService } from '../notifications/low-stock.service';
import { CreateInventoryDto, UpdateInventoryDto } from './dto/inventory.dto';
import { InventoryListQueryDto } from './dto/inventory-list-query.dto';
import {
  CreateStockAdjustmentDto,
  StockAdjustmentListQueryDto,
} from './dto/stock-adjustment.dto';
import { StockMovementListQueryDto } from './dto/stock-movement.dto';
import type {
  UploadedExcelFile,
  UploadedImageFile,
} from './dto/uploaded-file.interface';
import { UomService } from '../uom/uom.service';

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
const MAX_VARIANT_COMBINATIONS = 100;

function cartesianProduct<T>(arrays: T[][]): T[][] {
  if (arrays.length === 0) return [[]];
  return arrays.reduce<T[][]>(
    (acc, curr) =>
      acc.flatMap((prefix) => curr.map((item) => [...prefix, item])),
    [[]],
  );
}

function buildVariantKey(
  pairs: { attributeId: string; valueId: string }[],
): string {
  return pairs
    .slice()
    .sort((a, b) => a.attributeId.localeCompare(b.attributeId))
    .map((p) => `${p.attributeId}:${p.valueId}`)
    .join('|')
    .slice(0, 200);
}

function skuToken(code: string): string {
  return code
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

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
    @InjectRepository(StockMovement)
    private readonly movementRepo: Repository<StockMovement>,
    @InjectRepository(ItemAttributeValue)
    private readonly itemAttributeValueRepo: Repository<ItemAttributeValue>,
    @InjectRepository(ProductAttributeValue)
    private readonly attributeValueRepo: Repository<ProductAttributeValue>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly stockService: StockService,
    private readonly lowStockService: LowStockService,
    private readonly config: ConfigService,
    private readonly uomService: UomService,
  ) {}

  private async applyItemUoms(
    item: Item,
    fields: {
      unit?: string | null;
      stockUomId?: string | null;
      salesUomId?: string | null;
      purchaseUomId?: string | null;
      uomWidth?: number | null;
      dimensionPriceMode?: import('../common/enums').DimensionPriceMode | null;
      dimensionUomId?: string | null;
    },
  ) {
    if (fields.stockUomId !== undefined) {
      if (fields.stockUomId) {
        const uom = await this.uomService.findUom(fields.stockUomId);
        item.stockUomId = uom.id;
        item.unit = uom.symbol;
        // Clear loaded relation so TypeORM save() does not overwrite the new FK.
        item.stockUom = uom;
      } else {
        item.stockUomId = null;
        item.stockUom = null;
      }
    }
    if (fields.salesUomId !== undefined) {
      if (fields.salesUomId) {
        const uom = await this.uomService.findUom(fields.salesUomId);
        item.salesUomId = uom.id;
        item.salesUom = uom;
      } else {
        item.salesUomId = null;
        item.salesUom = null;
      }
    }
    if (fields.purchaseUomId !== undefined) {
      if (fields.purchaseUomId) {
        const uom = await this.uomService.findUom(fields.purchaseUomId);
        item.purchaseUomId = uom.id;
        item.purchaseUom = uom;
      } else {
        item.purchaseUomId = null;
        item.purchaseUom = null;
      }
    }
    if (fields.uomWidth !== undefined) {
      item.uomWidth =
        fields.uomWidth === null ? null : fields.uomWidth.toFixed(9);
    }
    if (fields.dimensionPriceMode !== undefined) {
      item.dimensionPriceMode = fields.dimensionPriceMode;
    }
    if (fields.dimensionUomId !== undefined) {
      if (fields.dimensionUomId) {
        const uom = await this.uomService.findUom(fields.dimensionUomId);
        if (uom.category?.code !== 'LENGTH') {
          throw new BadRequestException(
            'Cut dimension UOM must be a Length unit (m, cm, mm)',
          );
        }
        item.dimensionUomId = uom.id;
        item.dimensionUom = uom;
      } else {
        item.dimensionUomId = null;
        item.dimensionUom = null;
      }
    }
    if (fields.unit !== undefined && fields.stockUomId === undefined) {
      item.unit =
        fields.unit === null || fields.unit.trim() === ''
          ? null
          : fields.unit.trim();
      // Best-effort map free-text unit to a known UOM code/symbol
      if (item.unit && !item.stockUomId) {
        const byCode = await this.uomService.findByCode(item.unit);
        if (byCode) {
          item.stockUomId = byCode.id;
          item.salesUomId = item.salesUomId ?? byCode.id;
          item.purchaseUomId = item.purchaseUomId ?? byCode.id;
          item.unit = byCode.symbol;
        }
      }
    }
  }

  private mediaBase(requestBaseUrl?: string) {
    return {
      publicBaseUrl: publicBaseFromConfig(this.config),
      requestBaseUrl,
    };
  }

  private flattenItemAttributeValues(item: {
    itemAttributeValues?: ItemAttributeValue[] | null;
    attributeValues?: ProductAttributeValue[];
  }) {
    const links = item.itemAttributeValues ?? [];
    if (!links.length && item.attributeValues) return;
    item.attributeValues = links
      .map((link) => link.attributeValue)
      .filter((value): value is ProductAttributeValue => Boolean(value));
  }

  private attachItemImageUrl<
    T extends {
      quantity?: string | number | null;
      quantityLinear?: string | null;
      linearUomSymbol?: string | null;
      item?: {
        imagePath?: string | null;
        imageUrl?: string | null;
        uomWidth?: string | null;
        itemAttributeValues?: ItemAttributeValue[] | null;
        attributeValues?: ProductAttributeValue[];
        stockUom?: {
          conversionFactor?: string | null;
          category?: { hasConstantWidth?: boolean } | null;
        } | null;
        dimensionUom?: { symbol?: string | null; conversionFactor?: string | null } | null;
      } | null;
    },
  >(row: T, requestBaseUrl?: string): T {
    if (row.item) {
      row.item.imageUrl = absoluteMediaUrl(
        row.item.imagePath ?? null,
        this.mediaBase(requestBaseUrl),
      );
      this.flattenItemAttributeValues(row.item);
    }
    this.attachLinearQuantity(row);
    return row;
  }

  /** Dual display: stock area qty + equivalent linear length when constant width is set. */
  private attachLinearQuantity<
    T extends {
      quantity?: string | number | null;
      quantityLinear?: string | null;
      linearUomSymbol?: string | null;
      item?: {
        uomWidth?: string | null;
        stockUom?: {
          conversionFactor?: string | null;
          category?: { hasConstantWidth?: boolean } | null;
        } | null;
        dimensionUom?: { symbol?: string | null; conversionFactor?: string | null } | null;
      } | null;
    },
  >(row: T): void {
    const item = row.item;
    const width =
      item?.uomWidth != null ? parseFloat(String(item.uomWidth)) : NaN;
    const qty =
      row.quantity != null ? parseFloat(String(row.quantity)) : NaN;
    if (
      !item?.stockUom?.category?.hasConstantWidth ||
      !Number.isFinite(width) ||
      width <= 0 ||
      !Number.isFinite(qty)
    ) {
      return;
    }
    const stockF = parseFloat(item.stockUom?.conversionFactor || '1');
    if (!Number.isFinite(stockF) || stockF === 0) return;
    const stockCode = (item.stockUom as { category?: { code?: string } } | null)
      ?.category?.code;
    if (stockCode === 'LENGTH') {
      // Already linear meters (or length UOM): optional area equivalent.
      const lengthBase = qty * stockF;
      row.quantityLinear = (lengthBase * width).toFixed(9);
      row.linearUomSymbol = 'm²';
      return;
    }
    // Area stock → linear meters of roll.
    const areaBase = qty * stockF;
    row.quantityLinear = (areaBase / width).toFixed(9);
    row.linearUomSymbol = 'm';
  }

  private attachItemImageUrls<
    T extends {
      quantity?: string | number | null;
      quantityLinear?: string | null;
      linearUomSymbol?: string | null;
      item?: {
        imagePath?: string | null;
        imageUrl?: string | null;
        uomWidth?: string | null;
        itemAttributeValues?: ItemAttributeValue[] | null;
        attributeValues?: ProductAttributeValue[];
        stockUom?: {
          conversionFactor?: string | null;
          category?: { hasConstantWidth?: boolean } | null;
        } | null;
        dimensionUom?: { symbol?: string | null; conversionFactor?: string | null } | null;
      } | null;
    },
  >(rows: T[], requestBaseUrl?: string): T[] {
    return rows.map((row) => this.attachItemImageUrl(row, requestBaseUrl));
  }

  /**
   * Replace item attribute assignments.
   * Variants/simple items: at most one value per attribute.
   * Templates: multiple values per attribute allowed.
   */
  private async syncItemAttributeValues(
    itemId: string,
    attributeValueIds: string[],
    options?: { allowMultiplePerAttribute?: boolean },
  ) {
    const uniqueIds = [...new Set(attributeValueIds.filter(Boolean))];
    if (uniqueIds.length === 0) {
      await this.itemAttributeValueRepo.delete({ itemId });
      return;
    }

    const values = await this.attributeValueRepo.find({
      where: { id: In(uniqueIds), isActive: true },
      relations: { attribute: true },
    });
    if (values.length !== uniqueIds.length) {
      throw new BadRequestException(
        'One or more attribute values are invalid or inactive',
      );
    }

    if (!options?.allowMultiplePerAttribute) {
      const seenAttributeIds = new Set<string>();
      for (const value of values) {
        if (seenAttributeIds.has(value.attributeId)) {
          throw new BadRequestException(
            `Select only one value for attribute "${value.attribute?.name ?? value.attributeId}"`,
          );
        }
        seenAttributeIds.add(value.attributeId);
      }
    }

    await this.itemAttributeValueRepo.delete({ itemId });
    await this.itemAttributeValueRepo.save(
      values.map((value) =>
        this.itemAttributeValueRepo.create({
          itemId,
          attributeValueId: value.id,
        }),
      ),
    );
  }

  private async resolveVariantCombinations(
    variantAttributes: { attributeId: string; valueIds: string[] }[],
  ) {
    if (!variantAttributes.length) {
      return {
        allValueIds: [] as string[],
        combinations: [] as ProductAttributeValue[][],
      };
    }

    const allValueIds = [
      ...new Set(variantAttributes.flatMap((row) => row.valueIds)),
    ];
    const values = await this.attributeValueRepo.find({
      where: { id: In(allValueIds), isActive: true },
      relations: { attribute: true },
    });
    if (values.length !== allValueIds.length) {
      throw new BadRequestException(
        'One or more attribute values are invalid or inactive',
      );
    }
    const byId = new Map(values.map((v) => [v.id, v]));

    const orderedAttrs = variantAttributes
      .map((row) => {
        const uniqueValueIds = [...new Set(row.valueIds)];
        const attrValues = uniqueValueIds.map((id) => {
          const value = byId.get(id);
          if (!value) {
            throw new BadRequestException(`Unknown attribute value ${id}`);
          }
          if (value.attributeId !== row.attributeId) {
            throw new BadRequestException(
              `Value "${value.name}" does not belong to the selected attribute`,
            );
          }
          return value;
        });
        attrValues.sort(
          (a, b) =>
            (a.sequence ?? 0) - (b.sequence ?? 0) ||
            a.name.localeCompare(b.name),
        );
        return {
          attributeId: row.attributeId,
          sequence: attrValues[0]?.attribute?.sequence ?? 0,
          values: attrValues,
        };
      })
      .sort(
        (a, b) =>
          a.sequence - b.sequence || a.attributeId.localeCompare(b.attributeId),
      );

    const combinations = cartesianProduct(orderedAttrs.map((a) => a.values));
    return { allValueIds, combinations };
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
          .leftJoinAndSelect('item.stockUom', 'stockUom')
          .leftJoinAndSelect('stockUom.category', 'stockUomCategory')
          .leftJoinAndSelect('item.salesUom', 'salesUom')
          .leftJoinAndSelect('item.purchaseUom', 'purchaseUom')
          .leftJoinAndSelect('item.dimensionUom', 'dimensionUom')
          .leftJoinAndSelect('item.itemAttributeValues', 'itemAttributeValues')
          .leftJoinAndSelect(
            'itemAttributeValues.attributeValue',
            'attributeValue',
          )
          .leftJoinAndSelect('attributeValue.attribute', 'attribute')
          .leftJoinAndSelect('item.parentItem', 'parentItem')
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
      relations: {
        item: {
          stockUom: { category: true },
          salesUom: true,
          purchaseUom: true,
          dimensionUom: { category: true },
          itemUoms: { uom: true },
          parentItem: true,
          itemAttributeValues: {
            attributeValue: { attribute: true },
          },
        },
        location: true,
      },
    });
    if (!stock) throw new NotFoundException('Inventory record not found');
    const withImage = this.attachItemImageUrl(stock, requestBaseUrl);
    const stockUomLocked = await this.isStockUomLocked(stock.itemId);
    return Object.assign(withImage, { stockUomLocked });
  }

  /**
   * ERP rule: stock UOM is frozen once the item has on-hand qty or any
   * sale / purchase / adjustment / transfer / BOM / production history.
   */
  async isStockUomLocked(itemId: string): Promise<boolean> {
    const nonZero = await this.stockRepo
      .createQueryBuilder('s')
      .where('s.item_id = :itemId', { itemId })
      .andWhere('ABS(s.quantity::numeric) > 0.000000001')
      .getCount();
    if (nonZero > 0) return true;

    const checks: string[] = [
      `SELECT 1 FROM sale_lines WHERE item_id = $1 LIMIT 1`,
      `SELECT 1 FROM purchase_lines WHERE item_id = $1 LIMIT 1`,
      `SELECT 1 FROM stock_adjustments WHERE item_id = $1 LIMIT 1`,
      `SELECT 1 FROM stock_transfer_lines WHERE item_id = $1 LIMIT 1`,
      `SELECT 1 FROM bom_lines WHERE component_item_id = $1 LIMIT 1`,
      `SELECT 1 FROM boms WHERE finished_item_id = $1 OR variant_item_id = $1 LIMIT 1`,
      `SELECT 1 FROM production_order_lines WHERE component_item_id = $1 LIMIT 1`,
      `SELECT 1 FROM production_orders WHERE finished_item_id = $1 LIMIT 1`,
    ];
    for (const sql of checks) {
      const rows: unknown[] = await this.dataSource.query(sql, [itemId]);
      if (rows.length > 0) return true;
    }
    return false;
  }

  private async assertStockUomChangeAllowed(
    itemId: string,
    currentStockUomId: string | null,
    nextStockUomId: string | null | undefined,
  ) {
    if (nextStockUomId === undefined) return;
    const next = nextStockUomId ?? null;
    const current = currentStockUomId ?? null;
    if (next === current) return;
    if (await this.isStockUomLocked(itemId)) {
      throw new BadRequestException(
        'Stock UOM cannot be changed after stock or document history exists. Keep this stock UOM and use sales/purchase UOMs (same category), or create a new item.',
      );
    }
  }

  /** Sales/purchase UOM must stay in the stock UOM category (ERP rule). */
  private async assertTxnUomSameCategory(
    stockUomId: string | null,
    txnUomId: string | null | undefined,
    label: string,
  ) {
    if (!txnUomId || !stockUomId) return;
    const [stockUom, txnUom] = await Promise.all([
      this.uomService.findUom(stockUomId),
      this.uomService.findUom(txnUomId),
    ]);
    if (stockUom.categoryId !== txnUom.categoryId) {
      throw new BadRequestException(
        `${label} UOM must be in the same category as stock UOM`,
      );
    }
  }

  /** Cut pricing / constant width only when stock UOM category has constant width. */
  private async assertDimensionPricingRequiresAreaStock(
    stockUomId: string | null | undefined,
    dimensionPriceMode: import('../common/enums').DimensionPriceMode | null | undefined,
    uomWidth?: number | null,
  ) {
    const needsWidthCategory =
      Boolean(dimensionPriceMode) ||
      (uomWidth != null && Number.isFinite(uomWidth) && uomWidth > 0);
    if (!needsWidthCategory) return;
    if (!stockUomId) {
      throw new BadRequestException(
        'Constant width / cut pricing requires a constant-width stock UOM (e.g. m²). Set stock UOM first.',
      );
    }
    const stockUom = await this.uomService.findUom(stockUomId);
    if (!stockUom.category?.hasConstantWidth) {
      throw new BadRequestException(
        `Constant width / cut pricing requires a stock UOM category with "Has constant width" (e.g. Area / m²). Current stock UOM is ${stockUom.symbol} (${stockUom.category?.code ?? 'unknown'}).`,
      );
    }
  }

  /** Validate optional Length UOM used for W×H entry (null = meters). */
  private async ensureDimensionUom(item: Item) {
    if (!item.dimensionUomId) return;
    const uom = await this.uomService.findUom(item.dimensionUomId);
    if (uom.category?.code !== 'LENGTH') {
      throw new BadRequestException(
        'Cut dimension UOM must be a Length unit (m, cm, mm)',
      );
    }
    item.dimensionUom = uom;
  }

  private async prepareNewItemFields(dto: CreateInventoryDto): Promise<Item> {
    const item = this.itemRepo.create({
      sku: dto.sku?.trim() ? dto.sku.trim() : null,
      description: dto.description.trim(),
      unit: dto.unit ?? null,
      itemType: dto.itemType,
      isTemplate: false,
      parentItemId: null,
      variantKey: null,
    });
    await this.applyItemUoms(item, {
      unit: dto.unit,
      stockUomId: dto.stockUomId,
      salesUomId: dto.salesUomId,
      purchaseUomId: dto.purchaseUomId,
      uomWidth: dto.uomWidth,
      dimensionPriceMode: dto.dimensionPriceMode,
      dimensionUomId: dto.dimensionUomId,
    });
    if (!item.stockUomId) {
      const pcs = await this.uomService.findByCode('PCS');
      if (pcs) {
        item.stockUomId = pcs.id;
        item.salesUomId = item.salesUomId ?? pcs.id;
        item.purchaseUomId = item.purchaseUomId ?? pcs.id;
        item.unit = pcs.symbol;
      }
    }
    await this.assertTxnUomSameCategory(
      item.stockUomId,
      item.salesUomId,
      'Sales',
    );
    await this.assertTxnUomSameCategory(
      item.stockUomId,
      item.purchaseUomId,
      'Purchase',
    );
    await this.assertDimensionPricingRequiresAreaStock(
      item.stockUomId,
      item.dimensionPriceMode,
      item.uomWidth != null ? parseFloat(item.uomWidth) : null,
    );
    await this.ensureDimensionUom(item);
    return item;
  }

  private async createWithVariants(
    dto: CreateInventoryDto,
    combinations: ProductAttributeValue[][],
    allValueIds: string[],
    requestBaseUrl?: string,
  ) {
    if (combinations.length > MAX_VARIANT_COMBINATIONS) {
      throw new BadRequestException(
        `Too many variants (${combinations.length}). Maximum is ${MAX_VARIANT_COMBINATIONS}.`,
      );
    }

    const baseSku = dto.sku?.trim() || null;
    if (baseSku) {
      const existingSku = await this.itemRepo.findOne({
        where: { sku: baseSku },
      });
      if (existingSku) {
        throw new ConflictException('SKU already in use by another item');
      }
    }

    const stockIds = await this.dataSource.transaction(async (manager) => {
      const itemRepo = manager.getRepository(Item);
      const stockRepo = manager.getRepository(StockLevel);
      const linkRepo = manager.getRepository(ItemAttributeValue);

      const template = await this.prepareNewItemFields(dto);
      template.isTemplate = true;
      template.sku = baseSku;
      const savedTemplate = await itemRepo.save(template);

      await linkRepo.delete({ itemId: savedTemplate.id });
      await linkRepo.save(
        allValueIds.map((attributeValueId) =>
          linkRepo.create({
            itemId: savedTemplate.id,
            attributeValueId,
          }),
        ),
      );

      const createdStockIds: string[] = [];
      for (const combo of combinations) {
        const labels = combo.map((v) => v.name);
        const codes = combo.map((v) => skuToken(v.code || v.name));
        const key = buildVariantKey(
          combo.map((v) => ({
            attributeId: v.attributeId,
            valueId: v.id,
          })),
        );
        const variantSku = baseSku
          ? `${skuToken(baseSku)}-${codes.join('-')}`.slice(0, 80)
          : null;

        if (variantSku) {
          const clash = await itemRepo.findOne({ where: { sku: variantSku } });
          if (clash) {
            throw new ConflictException(
              `Generated SKU already exists: ${variantSku}`,
            );
          }
        }

        const variant = itemRepo.create({
          sku: variantSku,
          description: `${dto.description.trim()} (${labels.join(', ')})`,
          unit: savedTemplate.unit,
          stockUomId: savedTemplate.stockUomId,
          salesUomId: savedTemplate.salesUomId,
          purchaseUomId: savedTemplate.purchaseUomId,
          uomWidth: savedTemplate.uomWidth,
          dimensionPriceMode: savedTemplate.dimensionPriceMode,
          dimensionUomId: savedTemplate.dimensionUomId,
          itemType: savedTemplate.itemType,
          imagePath: savedTemplate.imagePath,
          isActive: true,
          isTemplate: false,
          parentItemId: savedTemplate.id,
          variantKey: key,
        });
        const savedVariant = await itemRepo.save(variant);

        await linkRepo.save(
          combo.map((value) =>
            linkRepo.create({
              itemId: savedVariant.id,
              attributeValueId: value.id,
            }),
          ),
        );

        const stock = await this.stockService.adjust(
          {
            locationId: dto.locationId,
            itemId: savedVariant.id,
            quantityDelta: dto.quantity,
            purchasePrice: dto.purchasePrice,
            refType: StockMovementRefType.OPENING,
            notes: 'Opening / variant stock',
          },
          manager,
        );
        if (dto.reorderPoint !== undefined) {
          stock.reorderPoint = dto.reorderPoint.toFixed(3);
          await stockRepo.save(stock);
        }
        createdStockIds.push(stock.id);
      }

      return { templateId: savedTemplate.id, stockIds: createdStockIds };
    });

    for (const stockId of stockIds.stockIds) {
      await this.lowStockService.evaluateInitialStock(stockId);
    }

    const template = await this.itemRepo.findOne({
      where: { id: stockIds.templateId },
      relations: {
        itemAttributeValues: { attributeValue: { attribute: true } },
      },
    });
    if (template) this.flattenItemAttributeValues(template);

    const variants: Awaited<ReturnType<InventoryService['findOne']>>[] = [];
    for (const stockId of stockIds.stockIds) {
      variants.push(await this.findOne(stockId, requestBaseUrl));
    }

    return { template, variants };
  }

  async create(dto: CreateInventoryDto, requestBaseUrl?: string) {
    await this.ensureLocation(dto.locationId);

    if (dto.variantAttributes?.length) {
      const { allValueIds, combinations } =
        await this.resolveVariantCombinations(dto.variantAttributes);
      if (combinations.length >= 2) {
        return this.createWithVariants(
          dto,
          combinations,
          allValueIds,
          requestBaseUrl,
        );
      }
      // 0–1 combination → simple item with flattened attributeValueIds
      if (combinations.length === 1) {
        dto.attributeValueIds = combinations[0].map((v) => v.id);
      }
    }

    let item = dto.sku
      ? await this.itemRepo.findOne({ where: { sku: dto.sku } })
      : null;
    if (!item) {
      item = await this.prepareNewItemFields(dto);
      item = await this.itemRepo.save(item);
    }

    if (dto.attributeValueIds !== undefined) {
      await this.syncItemAttributeValues(item.id, dto.attributeValueIds);
    }

    const adjusted = await this.stockService.adjust({
      locationId: dto.locationId,
      itemId: item.id,
      quantityDelta: dto.quantity,
      purchasePrice: dto.purchasePrice,
      refType: StockMovementRefType.OPENING,
      notes: 'Opening / add stock',
    });
    if (dto.reorderPoint !== undefined) {
      adjusted.reorderPoint = dto.reorderPoint.toFixed(3);
      const saved = await this.stockRepo.save(adjusted);
      await this.lowStockService.evaluateAfterReorderPointChange(saved.id);
      return this.findOne(saved.id, requestBaseUrl);
    }
    await this.lowStockService.evaluateInitialStock(adjusted.id);
    return this.findOne(adjusted.id, requestBaseUrl);
  }

  async update(id: string, dto: UpdateInventoryDto, requestBaseUrl?: string) {
    const stock = await this.findOne(id, requestBaseUrl);

    const itemChanged =
      dto.description !== undefined ||
      dto.sku !== undefined ||
      dto.unit !== undefined ||
      dto.itemType !== undefined ||
      dto.stockUomId !== undefined ||
      dto.salesUomId !== undefined ||
      dto.purchaseUomId !== undefined ||
      dto.uomWidth !== undefined ||
      dto.dimensionPriceMode !== undefined ||
      dto.dimensionUomId !== undefined;

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
      if (dto.itemType !== undefined) {
        stock.item.itemType = dto.itemType;
      }
      await this.assertStockUomChangeAllowed(
        stock.itemId,
        stock.item.stockUomId,
        dto.stockUomId,
      );
      const nextStockUomId =
        dto.stockUomId !== undefined
          ? dto.stockUomId
          : stock.item.stockUomId;
      await this.assertTxnUomSameCategory(
        nextStockUomId,
        dto.salesUomId,
        'Sales',
      );
      await this.assertTxnUomSameCategory(
        nextStockUomId,
        dto.purchaseUomId,
        'Purchase',
      );
      await this.applyItemUoms(stock.item, {
        unit: dto.unit,
        stockUomId: dto.stockUomId,
        salesUomId: dto.salesUomId,
        purchaseUomId: dto.purchaseUomId,
        uomWidth: dto.uomWidth,
        dimensionPriceMode: dto.dimensionPriceMode,
        dimensionUomId: dto.dimensionUomId,
      });
      await this.assertDimensionPricingRequiresAreaStock(
        stock.item.stockUomId,
        stock.item.dimensionPriceMode,
        stock.item.uomWidth != null ? parseFloat(stock.item.uomWidth) : null,
      );
      await this.ensureDimensionUom(stock.item);
      await this.itemRepo.save(stock.item);
    }

    if (dto.attributeValueIds !== undefined) {
      await this.syncItemAttributeValues(stock.itemId, dto.attributeValueIds);
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
      throw new BadRequestException('Image must be JPEG, PNG, WebP, or GIF');
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

  async findMovements(
    query: StockMovementListQueryDto,
    requestBaseUrl?: string,
  ) {
    const qb = this.movementRepo
      .createQueryBuilder('mv')
      .leftJoinAndSelect('mv.item', 'item')
      .leftJoinAndSelect('mv.location', 'location')
      .leftJoinAndSelect('mv.createdBy', 'createdBy')
      .orderBy('mv.created_at', 'DESC');

    if (query.locationId) {
      qb.andWhere('mv.location_id = :locationId', {
        locationId: query.locationId,
      });
    }
    if (query.itemId) {
      qb.andWhere('mv.item_id = :itemId', { itemId: query.itemId });
    }
    if (query.refType) {
      qb.andWhere('mv.ref_type = :refType', { refType: query.refType });
    }
    if (query.refId) {
      qb.andWhere('mv.ref_id = :refId', { refId: query.refId });
    }
    applyIlikeSearch(qb, query.search, [
      'mv.notes',
      'item.description',
      'item.sku',
    ]);
    applyDateRangeToQb(qb, 'mv.created_at', query.from, query.to);

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

      const saved = await adjustmentRepo.save(
        adjustmentRepo.create({
          locationId: dto.locationId,
          itemId: dto.itemId,
          direction: dto.direction,
          quantity: Math.abs(dto.quantity).toFixed(3),
          quantityBefore: quantityBefore.toFixed(3),
          quantityAfter: (quantityBefore + delta).toFixed(3),
          reason: dto.reason,
          notes: dto.notes?.trim() || null,
          reference: dto.reference?.trim() || null,
          createdById: userId ?? null,
        }),
      );

      await this.stockService.adjust(
        {
          locationId: dto.locationId,
          itemId: dto.itemId,
          quantityDelta: delta,
          purchasePrice:
            dto.direction === StockAdjustmentDirection.IN
              ? dto.purchasePrice
              : undefined,
          refType: StockMovementRefType.STOCK_ADJUSTMENT,
          refId: saved.id,
          notes: dto.reason,
          createdById: userId ?? null,
        },
        manager,
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
        const stockId =
          saved && typeof saved === 'object' && 'variants' in saved
            ? saved.variants[0]?.id
            : (saved as { id: string }).id;

        let status = 'imported';
        const embedded = embeddedByExcelRow.get(excelRow);
        if (embedded) {
          try {
            await this.uploadItemImage(stockId, embedded);
            status = 'imported+image';
          } catch (imgErr) {
            status = `imported (image failed: ${exceptionMessage(imgErr)})`;
          }
        } else if (imageUrlRaw) {
          try {
            await this.attachImageFromUrl(stockId, imageUrlRaw);
            status = 'imported+image';
          } catch (imgErr) {
            status = `imported (image failed: ${exceptionMessage(imgErr)})`;
          }
        }

        results.push({ row: excelRow, status, id: stockId });
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
  if (
    parts.length === 4 &&
    parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
  ) {
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

  const firstSheet = workbookXml.match(/<sheet[^>]*\br:id="([^"]+)"[^>]*\/?>/);
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
