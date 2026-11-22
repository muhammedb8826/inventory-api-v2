import { BadRequestException } from '@nestjs/common';
import { DimensionPriceMode } from '../common/enums';
import { Item } from '../database/entities/item.entity';
import { UomConversionService } from './uom-conversion.service';
import { resolveLineUom, type ResolvedLineUom } from './resolve-line-uom';

export type LineDimensionsInput = {
  width?: number | null;
  height?: number | null;
  pieces?: number | null;
  /** Length UOM for W×H (m/cm/mm). Omit = meters (LENGTH base). */
  dimUomId?: string | null;
};

export type ResolvedDimensionalLine = ResolvedLineUom & {
  dimWidth: number | null;
  dimHeight: number | null;
  dimPieces: number | null;
  dimUomId: string | null;
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

function categoryHasConstantWidth(item: Item): boolean {
  return Boolean(item.stockUom?.category?.hasConstantWidth);
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
    if (!categoryHasConstantWidth(item)) {
      throw new BadRequestException(
        `Width × height is not enabled for "${item.description}". ` +
          'Enable "Has constant width" on the stock UOM category, or remove dimensions from the line.',
      );
    }

    const height = dims?.height;
    if (
      height == null ||
      !Number.isFinite(height) ||
      height <= 0
    ) {
      throw new BadRequestException(
        'Cut lines require a positive height (width defaults from item constant width when omitted)',
      );
    }

    // Dimension unit comes from the line (Cut in / line UOM), not the item.
    const lengthUomId = dims?.dimUomId ?? null;
    let width = dims?.width;
    if (
      width == null ||
      !Number.isFinite(width) ||
      width <= 0
    ) {
      const constant =
        item.uomWidth != null ? parseFloat(item.uomWidth) : NaN;
      if (!Number.isFinite(constant) || constant <= 0) {
        throw new BadRequestException(
          'Cut lines need a positive width, or set Constant width on the item',
        );
      }
      // uomWidth is stored in LENGTH base (meters); express in Cut-in UOM.
      width = await conversion.fromLengthBase(constant, lengthUomId);
    }

    const piecesRaw = dims?.pieces;
    const pieces =
      piecesRaw == null || piecesRaw === undefined ? 1 : Number(piecesRaw);
    if (!Number.isFinite(pieces) || pieces < 1) {
      throw new BadRequestException('Pieces must be at least 1');
    }

    const stockLabel =
      item.stockUom?.symbol ?? item.stockUom?.code ?? item.unit ?? 'unknown';
    if (!item.stockUom?.category?.hasConstantWidth) {
      throw new BadRequestException(
        `Width × height cuts need a constant-width stock category (e.g. Area / m²). "${item.description}" is stocked in ${stockLabel}.`,
      );
    }

    const [wLen, hLen] = await Promise.all([
      conversion.toLengthBase(width, lengthUomId),
      conversion.toLengthBase(height, lengthUomId),
    ]);
    const dimUomId = wLen.uom?.id ?? lengthUomId;

    // Area in m² (LENGTH base × LENGTH base).
    const areaBase = wLen.base * hLen.base * pieces;
    const stockCode = item.stockUom?.category?.code ?? null;
    const stockF = item.stockUom
      ? parseFloat(item.stockUom.conversionFactor || '1')
      : 1;
    if (!Number.isFinite(stockF) || stockF === 0) {
      throw new BadRequestException('Stock UOM conversion factor is zero');
    }

    let stockQuantity: number;
    if (stockCode === 'LENGTH') {
      // Stocked as roll length: length = area / constant width.
      const constant =
        item.uomWidth != null ? parseFloat(item.uomWidth) : NaN;
      if (!Number.isFinite(constant) || constant <= 0) {
        throw new BadRequestException(
          'Constant width is required to convert cuts into length stock',
        );
      }
      stockQuantity = areaBase / constant / stockF;
    } else {
      // Stocked as area (m², etc.).
      stockQuantity = areaBase / stockF;
    }

    // Default By area when cut dims are used but cut pricing was left unset.
    const mode = item.dimensionPriceMode ?? DimensionPriceMode.AREA;
    const lineTotal =
      mode === DimensionPriceMode.PIECE
        ? pieces * unitPrice
        : stockQuantity * unitPrice;

    // Document qty: pieces for PIECE pricing, else qty in stock UOM
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
      dimUomId,
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
    dimUomId: null,
    lineTotal: quantity * unitPrice,
    isCut: false,
  };
}
