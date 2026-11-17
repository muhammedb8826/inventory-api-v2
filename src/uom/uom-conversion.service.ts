import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Item } from '../database/entities/item.entity';
import { ItemUom } from '../database/entities/item-uom.entity';
import { Uom } from '../database/entities/uom.entity';

const LENGTH = 'LENGTH';
const AREA = 'AREA';

export type ConvertToStockInput = {
  item: Item;
  fromUomId: string | null | undefined;
  quantity: number;
};

/**
 * Converts transaction quantities ↔ stock UOM.
 *
 * Same category: qty_stock = qty * (from.factor / stock.factor)
 *   (or item_uoms.conversion_factor when defined: 1 fromUom = factor stock units)
 *
 * Length → Area (item.uomWidth set):
 *   area_base = length_base * width
 *   stock = area_base / stock.factor
 */
@Injectable()
export class UomConversionService {
  constructor(
    @InjectRepository(Uom)
    private readonly uomRepo: Repository<Uom>,
    @InjectRepository(ItemUom)
    private readonly itemUomRepo: Repository<ItemUom>,
  ) {}

  async resolveTxnUomId(
    item: Item,
    preferred: 'sales' | 'purchase' | 'stock',
    explicitUomId?: string | null,
  ): Promise<string | null> {
    if (explicitUomId) return explicitUomId;
    if (preferred === 'sales' && item.salesUomId) return item.salesUomId;
    if (preferred === 'purchase' && item.purchaseUomId) {
      return item.purchaseUomId;
    }
    return item.stockUomId ?? null;
  }

  /**
   * Convert a document quantity into the item's stock UOM quantity.
   * If the item has no stock UOM, returns the raw quantity (legacy).
   */
  async toStockQuantity(input: ConvertToStockInput): Promise<number> {
    const { item, quantity } = input;
    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new BadRequestException('Quantity must be a non-negative number');
    }
    if (!item.stockUomId) {
      return quantity;
    }

    const fromUomId = input.fromUomId || item.stockUomId;
    if (fromUomId === item.stockUomId) {
      return quantity;
    }

    // Item-specific override: 1 fromUom = conversionFactor stock units
    const itemFactor = await this.itemUomRepo.findOne({
      where: { itemId: item.id, uomId: fromUomId },
    });
    if (itemFactor) {
      return quantity * parseFloat(itemFactor.conversionFactor);
    }

    const [fromUom, stockUom] = await Promise.all([
      this.requireUom(fromUomId),
      this.requireUom(item.stockUomId),
    ]);

    if (fromUom.categoryId === stockUom.categoryId) {
      const fromF = parseFloat(fromUom.conversionFactor);
      const stockF = parseFloat(stockUom.conversionFactor);
      if (stockF === 0) {
        throw new BadRequestException('Stock UOM conversion factor is zero');
      }
      return (quantity * fromF) / stockF;
    }

    // Length ↔ Area via item width
    const fromCode = fromUom.category?.code;
    const stockCode = stockUom.category?.code;
    const width = item.uomWidth != null ? parseFloat(item.uomWidth) : NaN;

    if (
      fromCode === LENGTH &&
      stockCode === AREA &&
      Number.isFinite(width) &&
      width > 0
    ) {
      const lengthBase = quantity * parseFloat(fromUom.conversionFactor);
      const areaBase = lengthBase * width;
      const stockF = parseFloat(stockUom.conversionFactor);
      if (stockF === 0) {
        throw new BadRequestException('Stock UOM conversion factor is zero');
      }
      return areaBase / stockF;
    }

    if (
      fromCode === AREA &&
      stockCode === LENGTH &&
      Number.isFinite(width) &&
      width > 0
    ) {
      const areaBase = quantity * parseFloat(fromUom.conversionFactor);
      const lengthBase = areaBase / width;
      const stockF = parseFloat(stockUom.conversionFactor);
      if (stockF === 0) {
        throw new BadRequestException('Stock UOM conversion factor is zero');
      }
      return lengthBase / stockF;
    }

    throw new BadRequestException(
      `Cannot convert ${fromUom.symbol} to ${stockUom.symbol} for this item. ` +
        `Add an item UOM conversion, or set uomWidth for Length↔Area.`,
    );
  }

  /** Inverse of toStockQuantity (approx; item overrides preferred). */
  async fromStockQuantity(
    item: Item,
    toUomId: string,
    stockQuantity: number,
  ): Promise<number> {
    if (!item.stockUomId || toUomId === item.stockUomId) {
      return stockQuantity;
    }

    const itemFactor = await this.itemUomRepo.findOne({
      where: { itemId: item.id, uomId: toUomId },
    });
    if (itemFactor) {
      const f = parseFloat(itemFactor.conversionFactor);
      if (f === 0) {
        throw new BadRequestException('Item UOM conversion factor is zero');
      }
      return stockQuantity / f;
    }

    // Reuse toStock with qty=1 to get factor, then invert
    const oneInStock = await this.toStockQuantity({
      item,
      fromUomId: toUomId,
      quantity: 1,
    });
    if (oneInStock === 0) {
      throw new BadRequestException('Invalid UOM conversion factor');
    }
    return stockQuantity / oneInStock;
  }

  /**
   * Convert a length measurement into the LENGTH category base (meters).
   * When `uomId` is omitted, the value is already assumed to be in meters.
   */
  async toLengthBase(
    value: number,
    uomId?: string | null,
  ): Promise<{ base: number; uom: Uom | null }> {
    if (!Number.isFinite(value)) {
      throw new BadRequestException('Invalid length value');
    }
    if (!uomId) {
      return { base: value, uom: null };
    }
    const uom = await this.requireUom(uomId);
    if (uom.category?.code !== LENGTH) {
      throw new BadRequestException(
        'Cut dimension UOM must be a Length unit (m, cm, mm)',
      );
    }
    return {
      base: value * parseFloat(uom.conversionFactor || '1'),
      uom,
    };
  }

  private async requireUom(id: string): Promise<Uom> {
    const uom = await this.uomRepo.findOne({
      where: { id },
      relations: { category: true },
    });
    if (!uom || !uom.isActive) {
      throw new BadRequestException('Unit of measure not found or inactive');
    }
    return uom;
  }
}
