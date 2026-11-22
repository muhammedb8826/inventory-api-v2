import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { StockMovementRefType } from '../common/enums';
import { Item } from '../database/entities/item.entity';
import { StockLevel } from '../database/entities/stock-level.entity';
import { StockMovement } from '../database/entities/stock-movement.entity';

export interface StockMovementRef {
  refType?: StockMovementRefType | null;
  refId?: string | null;
  notes?: string | null;
  createdById?: string | null;
}

export interface StockAdjustment {
  locationId: string;
  itemId: string;
  quantityDelta: number;
  purchasePrice?: number;
  refType?: StockMovementRefType | null;
  refId?: string | null;
  notes?: string | null;
  createdById?: string | null;
}

@Injectable()
export class StockService {
  constructor(
    @InjectRepository(StockLevel)
    private readonly stockRepo: Repository<StockLevel>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(StockMovement)
    private readonly movementRepo: Repository<StockMovement>,
  ) {}

  private repos(manager?: EntityManager) {
    return {
      stock: manager ? manager.getRepository(StockLevel) : this.stockRepo,
      item: manager ? manager.getRepository(Item) : this.itemRepo,
      movement: manager
        ? manager.getRepository(StockMovement)
        : this.movementRepo,
    };
  }

  async getStock(
    locationId: string,
    itemId: string,
    manager?: EntityManager,
  ): Promise<StockLevel | null> {
    const { stock } = this.repos(manager);
    return stock.findOne({ where: { locationId, itemId } });
  }

  async getQuantity(
    locationId: string,
    itemId: string,
    manager?: EntityManager,
  ): Promise<number> {
    const row = await this.getStock(locationId, itemId, manager);
    return row ? parseFloat(row.quantity) : 0;
  }

  async adjust(
    adj: StockAdjustment,
    manager?: EntityManager,
  ): Promise<StockLevel> {
    const { stock, item, movement } = this.repos(manager);
    const catalogItem = await item.findOne({ where: { id: adj.itemId } });
    if (!catalogItem) throw new BadRequestException('Item not found');

    let row = await this.getStock(adj.locationId, adj.itemId, manager);
    if (!row) {
      row = stock.create({
        locationId: adj.locationId,
        itemId: adj.itemId,
        quantity: '0',
        purchasePrice: String(adj.purchasePrice ?? 0),
      });
    }

    const currentQty = parseFloat(row.quantity);
    const newQty = currentQty + adj.quantityDelta;

    if (adj.purchasePrice !== undefined && adj.quantityDelta > 0) {
      const currentPrice = parseFloat(row.purchasePrice);
      const incoming = adj.quantityDelta;
      const weighted =
        currentQty <= 0
          ? adj.purchasePrice
          : (currentQty * currentPrice + incoming * adj.purchasePrice) /
            (currentQty + incoming);
      row.purchasePrice = weighted.toFixed(2);
    }

    row.quantity = newQty.toFixed(3);
    const saved = await stock.save(row);

    if (adj.quantityDelta !== 0) {
      await movement.save(
        movement.create({
          locationId: adj.locationId,
          itemId: adj.itemId,
          quantityDelta: adj.quantityDelta.toFixed(3),
          quantityBefore: currentQty.toFixed(3),
          quantityAfter: newQty.toFixed(3),
          refType: adj.refType ?? null,
          refId: adj.refId ?? null,
          notes: adj.notes?.trim() || null,
          createdById: adj.createdById ?? null,
        }),
      );
    }

    return saved;
  }

  async transfer(
    fromLocationId: string,
    toLocationId: string,
    itemId: string,
    quantity: number,
    manager?: EntityManager,
    ref?: StockMovementRef,
  ): Promise<void> {
    if (quantity <= 0) {
      throw new BadRequestException('Quantity must be positive');
    }

    const fromStock = await this.getStock(fromLocationId, itemId, manager);
    const available = fromStock ? parseFloat(fromStock.quantity) : 0;
    if (available < quantity) {
      throw new BadRequestException(
        `Insufficient stock. Available: ${available}, requested: ${quantity}`,
      );
    }

    const purchasePrice = fromStock ? parseFloat(fromStock.purchasePrice) : 0;
    const baseRef = {
      refType: ref?.refType ?? StockMovementRefType.STOCK_TRANSFER,
      refId: ref?.refId ?? null,
      createdById: ref?.createdById ?? null,
    };

    await this.adjust(
      {
        locationId: fromLocationId,
        itemId,
        quantityDelta: -quantity,
        ...baseRef,
        notes: ref?.notes?.trim() || 'Transfer out',
      },
      manager,
    );
    await this.adjust(
      {
        locationId: toLocationId,
        itemId,
        quantityDelta: quantity,
        purchasePrice,
        ...baseRef,
        notes: ref?.notes?.trim() || 'Transfer in',
      },
      manager,
    );
  }

  async checkAvailability(
    locationId: string,
    lines: { itemId: string; quantity: number }[],
    allowNegative: boolean,
    manager?: EntityManager,
  ): Promise<string[]> {
    const { item } = this.repos(manager);
    const warnings: string[] = [];
    for (const line of lines) {
      const available = await this.getQuantity(
        locationId,
        line.itemId,
        manager,
      );
      if (available < line.quantity) {
        const catalogItem = await item.findOne({ where: { id: line.itemId } });
        const msg = `${catalogItem?.description ?? line.itemId}: requested ${line.quantity}, available ${available}`;
        if (!allowNegative) {
          throw new BadRequestException(`Stock unavailable: ${msg}`);
        }
        warnings.push(msg);
      }
    }
    return warnings;
  }
}
