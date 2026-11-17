import { BadRequestException } from '@nestjs/common';
import { DimensionPriceMode } from '../common/enums';
import { Item } from '../database/entities/item.entity';
import { UomConversionService } from './uom-conversion.service';
import { resolveLineUom, type ResolvedLineUom } from './resolve-line-uom';

const AREA = 'AREA';

export type LineDimensionsInput = {
  width?: number | null;
  height?: number | null;
  pieces?: number | null;
};

export type ResolvedDimensionalLine = ResolvedLineUom & {
  dimWidth: number | null;
  dimHeight: number | null;
  dimPieces: number | null;
  lineTotal: number;
  /** True when W×H cut math was applied. */
  isCut: boolean;
};

function hasAnyDimension(dims?: LineDimensionsInput | null): boolean {
  if (!dims) return false;
  return (
    dims.width != null ||
    dims.height != null ||
    (dims.pieces != null && dims.pieces !== 1)
  );
}

/**
 * Resolve txn qty → stock qty and line total.
 * Cut lines (W×H): stock = W × H × pieces in area base → stock UOM.
 * Roll / plain: existing UOM conversion (Length × item.uomWidth when applicable).
 */
export async function resolveDimensionalLine(
  conversion: UomConversionService,
  item: Item,
  preferred: 'sales' | 'purchase' | 'stock',
  quantity: number,
  unitPrice: number,
  explicitUomId?: string | null,
  dims?: LineDimensionsInput | null,
): Promise<ResolvedDimensionalLine> {
  const wantsCut = hasAnyDimension(dims);

  if (wantsCut) {
    const width = dims?.width;
    const height = dims?.height;
    if (
      width == null ||
      height == null ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      throw new BadRequestException(
        'Cut lines require positive width and height',
      );
    }
    const piecesRaw = dims?.pieces;
    const pieces =
      piecesRaw == null || piecesRaw === undefined ? 1 : Number(piecesRaw);
    if (!Number.isFinite(pieces) || pieces < 1) {
      throw new BadRequestException('Pieces must be at least 1');
    }

    if (!item.dimensionPriceMode) {
      throw new BadRequestException(
        'Enable dimension pricing on the item (By area or By piece) before using cuts',
      );
    }
    const stockCategory = item.stockUom?.category?.code;
    const stockLabel =
      item.stockUom?.symbol ?? item.stockUom?.code ?? item.unit ?? 'unknown';
    if (!stockCategory || stockCategory !== AREA) {
      throw new BadRequestException(
        `Width × height cuts need an Area stock UOM (e.g. m²). "${item.description}" is stocked in ${stockLabel}` +
          (stockCategory ? ` (${stockCategory})` : '') +
          '. Set stock UOM to Square Meter, keep roll width for Length purchases, then retry.',
      );
    }

    const areaBase = width * height * pieces;
    let stockQuantity = areaBase;
    if (item.stockUomId && item.stockUom) {
      const stockF = parseFloat(item.stockUom.conversionFactor || '1');
      if (!Number.isFinite(stockF) || stockF === 0) {
        throw new BadRequestException('Stock UOM conversion factor is zero');
      }
      stockQuantity = areaBase / stockF;
    }

    const mode = item.dimensionPriceMode;
    const lineTotal =
      mode === DimensionPriceMode.PIECE
        ? pieces * unitPrice
        : stockQuantity * unitPrice;

    // Document qty: pieces for PIECE pricing, else area in stock UOM
    const documentQty =
      mode === DimensionPriceMode.PIECE ? pieces : stockQuantity;

    const uomId =
      mode === DimensionPriceMode.PIECE
        ? (await conversion.resolveTxnUomId(item, preferred, explicitUomId))
        : (item.stockUomId ??
          (await conversion.resolveTxnUomId(item, preferred, explicitUomId)));

    return {
      itemId: item.id,
      quantity: documentQty,
      uomId,
      stockQuantity,
      dimWidth: width,
      dimHeight: height,
      dimPieces: pieces,
      lineTotal,
      isCut: true,
    };
  }

  const resolved = await resolveLineUom(
    conversion,
    item,
    preferred,
    quantity,
    explicitUomId,
  );
  return {
    ...resolved,
    dimWidth: null,
    dimHeight: null,
    dimPieces: null,
    lineTotal: quantity * unitPrice,
    isCut: false,
  };
}
