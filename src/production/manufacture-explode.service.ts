import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { BomType } from '../common/enums';
import { Bom } from '../database/entities/bom.entity';
import { Item } from '../database/entities/item.entity';

export type ExplodedComponent = {
  componentItemId: string;
  quantityRequired: number;
};

const MAX_BOM_DEPTH = 8;

/**
 * Multi-level Manufacture BoM explosion (Odoo/ERPNext style).
 * Nested active Manufacture BoMs are exploded to leaf components.
 */
@Injectable()
export class ManufactureExplodeService {
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
   * Explode a root Manufacture BoM for `quantityPlanned` finished units
   * into merged leaf component requirements (stock UOM).
   */
  async explodeRootBom(
    rootBom: Bom,
    quantityPlanned: number,
    manager?: EntityManager,
  ): Promise<ExplodedComponent[]> {
    if (!rootBom.lines?.length) {
      throw new BadRequestException('BOM has no component lines');
    }
    const bomQty = Math.max(parseFloat(rootBom.quantity || '1') || 1, 0.001);
    const scale = quantityPlanned / bomQty;
    const merged = new Map<string, number>();
    const visited = new Set<string>([rootBom.id]);

    for (const line of rootBom.lines) {
      const perBom =
        line.stockQuantity != null && line.stockQuantity !== ''
          ? parseFloat(line.stockQuantity)
          : parseFloat(line.quantity) *
            (1 + (parseFloat(line.scrapPercent) || 0) / 100);
      if (!Number.isFinite(perBom) || perBom <= 0) continue;
      await this.explodeComponent(
        line.componentItemId,
        perBom * scale,
        merged,
        visited,
        1,
        manager,
      );
    }

    if (merged.size === 0) {
      throw new BadRequestException('BOM explosion produced no components');
    }

    return [...merged.entries()].map(([componentItemId, quantityRequired]) => ({
      componentItemId,
      quantityRequired,
    }));
  }

  private async explodeComponent(
    itemId: string,
    quantity: number,
    merged: Map<string, number>,
    visitedBomIds: Set<string>,
    depth: number,
    manager?: EntityManager,
  ) {
    if (!Number.isFinite(quantity) || quantity <= 0) return;

    if (depth > MAX_BOM_DEPTH) {
      throw new BadRequestException(
        `BoM nesting exceeds ${MAX_BOM_DEPTH} levels — check for cycles or flatten the recipe`,
      );
    }

    const nested = await this.findActiveManufactureBom(itemId, manager);
    if (!nested?.lines?.length) {
      merged.set(itemId, (merged.get(itemId) ?? 0) + quantity);
      return;
    }

    if (visitedBomIds.has(nested.id)) {
      throw new BadRequestException(
        'Circular Manufacture BoM detected while exploding components',
      );
    }

    const nextVisited = new Set(visitedBomIds);
    nextVisited.add(nested.id);
    const bomQty = Math.max(parseFloat(nested.quantity || '1') || 1, 0.001);
    const scale = quantity / bomQty;

    for (const line of nested.lines) {
      const perBom =
        line.stockQuantity != null && line.stockQuantity !== ''
          ? parseFloat(line.stockQuantity)
          : parseFloat(line.quantity) *
            (1 + (parseFloat(line.scrapPercent) || 0) / 100);
      if (!Number.isFinite(perBom) || perBom <= 0) continue;
      await this.explodeComponent(
        line.componentItemId,
        perBom * scale,
        merged,
        nextVisited,
        depth + 1,
        manager,
      );
    }
  }

  /**
   * Prefer variant BoM → finished BoM → parent product BoM (when item is a variant).
   */
  async findActiveManufactureBom(
    itemId: string,
    manager?: EntityManager,
  ): Promise<Bom | null> {
    const { bom, item } = this.repos(manager);

    const variantBom = await bom.findOne({
      where: {
        bomType: BomType.MANUFACTURE,
        isActive: true,
        variantItemId: itemId,
      },
      relations: { lines: true },
      order: { updatedAt: 'DESC' },
    });
    if (variantBom) return variantBom;

    const finishedBom = await bom.findOne({
      where: {
        bomType: BomType.MANUFACTURE,
        isActive: true,
        finishedItemId: itemId,
        variantItemId: IsNull(),
      },
      relations: { lines: true },
      order: { updatedAt: 'DESC' },
    });
    if (finishedBom) return finishedBom;

    const row = await item.findOne({ where: { id: itemId } });
    if (row?.parentItemId) {
      const parentBom = await bom.findOne({
        where: {
          bomType: BomType.MANUFACTURE,
          isActive: true,
          finishedItemId: row.parentItemId,
          variantItemId: IsNull(),
        },
        relations: { lines: true },
        order: { updatedAt: 'DESC' },
      });
      if (parentBom) return parentBom;
    }

    return null;
  }
}
