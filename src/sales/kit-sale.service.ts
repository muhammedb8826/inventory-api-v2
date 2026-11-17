import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { BomType } from '../common/enums';
import { Bom } from '../database/entities/bom.entity';
import { Item } from '../database/entities/item.entity';
import { SaleLine } from '../database/entities/sale-line.entity';

export type KitStockMove = {
  itemId: string;
  quantity: number;
};

export type KitExplosion = {
  /** True when an active Kit BoM was applied (components deducted, not the kit SKU). */
  isKit: boolean;
  bomId: string | null;
  moves: KitStockMove[];
};

/**
 * ERP kit / product-bundle behaviour:
 * selling a kit explodes the Kit BoM and deducts components (not the kit parent).
 */
@Injectable()
export class KitSaleService {
  constructor(
    @InjectRepository(Bom)
    private readonly bomRepo: Repository<Bom>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
  ) {}

  private repos(manager?: EntityManager) {
    return {
      bom: manager ? manager.getRepository(Bom) : this.bomRepo,
      item: manager ? manager.getRepository(Item) : this.itemRepo,
    };
  }

  /**
   * Resolve stock moves for one sale line quantity (in stock UOM).
   * Active Kit BoM → always explode components (Odoo / ERPNext style).
   * Otherwise → deduct the sold item.
   */
  async explodeSaleLine(
    itemId: string,
    saleStockQuantity: number,
    manager?: EntityManager,
  ): Promise<KitExplosion> {
    const bom = await this.findActiveKitBom(itemId, manager);
    if (!bom?.lines?.length) {
      return {
        isKit: false,
        bomId: null,
        moves: [{ itemId, quantity: saleStockQuantity }],
      };
    }

    const bomQty = Math.max(parseFloat(bom.quantity || '1') || 1, 0.001);
    const scale = saleStockQuantity / bomQty;
    const merged = new Map<string, number>();

    for (const line of bom.lines) {
      const lineStock =
        line.stockQuantity != null && line.stockQuantity !== ''
          ? parseFloat(line.stockQuantity)
          : parseFloat(line.quantity);
      if (!Number.isFinite(lineStock) || lineStock <= 0) continue;
      const qty = lineStock * scale;
      merged.set(
        line.componentItemId,
        (merged.get(line.componentItemId) ?? 0) + qty,
      );
    }

    if (merged.size === 0) {
      return {
        isKit: false,
        bomId: null,
        moves: [{ itemId, quantity: saleStockQuantity }],
      };
    }

    return {
      isKit: true,
      bomId: bom.id,
      moves: [...merged.entries()].map(([id, quantity]) => ({
        itemId: id,
        quantity,
      })),
    };
  }

  /**
   * Prefer variant-specific Kit BoM, then product-level Kit BoM,
   * then parent product Kit BoM when selling a variant.
   */
  async findActiveKitBom(
    itemId: string,
    manager?: EntityManager,
  ): Promise<Bom | null> {
    const { bom, item } = this.repos(manager);

    const variantBom = await bom.findOne({
      where: {
        bomType: BomType.KIT,
        isActive: true,
        variantItemId: itemId,
      },
      relations: { lines: true },
      order: { updatedAt: 'DESC' },
    });
    if (variantBom) return variantBom;

    const finishedBom = await bom.findOne({
      where: {
        bomType: BomType.KIT,
        isActive: true,
        finishedItemId: itemId,
        variantItemId: IsNull(),
      },
      relations: { lines: true },
      order: { updatedAt: 'DESC' },
    });
    if (finishedBom) return finishedBom;

    const catalogItem = await item.findOne({ where: { id: itemId } });
    if (catalogItem?.parentItemId) {
      return bom.findOne({
        where: {
          bomType: BomType.KIT,
          isActive: true,
          finishedItemId: catalogItem.parentItemId,
          variantItemId: IsNull(),
        },
        relations: { lines: true },
        order: { updatedAt: 'DESC' },
      });
    }

    return null;
  }

  /** Stock moves to restore when voiding/updating a posted sale line. */
  restoreMovesForLine(line: SaleLine): KitStockMove[] {
    if (line.components?.length) {
      const merged = new Map<string, number>();
      for (const c of line.components) {
        const qty = parseFloat(c.stockQuantity);
        if (!Number.isFinite(qty) || qty === 0) continue;
        merged.set(
          c.componentItemId,
          (merged.get(c.componentItemId) ?? 0) + qty,
        );
      }
      if (merged.size > 0) {
        return [...merged.entries()].map(([id, quantity]) => ({
          itemId: id,
          quantity,
        }));
      }
    }
    return [
      {
        itemId: line.itemId,
        quantity:
          line.stockQuantity != null && line.stockQuantity !== ''
            ? parseFloat(String(line.stockQuantity))
            : parseFloat(String(line.quantity)),
      },
    ];
  }

  mergeMoves(moves: KitStockMove[]): KitStockMove[] {
    const merged = new Map<string, number>();
    for (const m of moves) {
      if (!Number.isFinite(m.quantity) || m.quantity === 0) continue;
      merged.set(m.itemId, (merged.get(m.itemId) ?? 0) + m.quantity);
    }
    return [...merged.entries()].map(([itemId, quantity]) => ({
      itemId,
      quantity,
    }));
  }
}
