import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationType } from '../common/enums';
import { buildMeta } from '../common/utils/query.util';
import { StockLevel } from '../database/entities/stock-level.entity';
import { NotificationsService } from './notifications.service';

export type StockQuantityChange = {
  locationId: string;
  itemId: string;
  previousQuantity: number;
};

@Injectable()
export class LowStockService {
  constructor(
    @InjectRepository(StockLevel)
    private readonly stockRepo: Repository<StockLevel>,
    private readonly notifications: NotificationsService,
  ) {}

  async findAllLowStock(query: {
    locationId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.stockRepo
      .createQueryBuilder('stock')
      .leftJoinAndSelect('stock.item', 'item')
      .leftJoinAndSelect('stock.location', 'location')
      .where(
        `(stock.reorder_point IS NOT NULL
          AND CAST(stock.quantity AS DECIMAL) <= CAST(stock.reorder_point AS DECIMAL))
         OR CAST(stock.quantity AS DECIMAL) <= 0`,
      )
      .orderBy('stock.quantity', 'ASC');

    if (query.locationId) {
      qb.andWhere('stock.location_id = :locationId', {
        locationId: query.locationId,
      });
    }

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: data.map((stock) => this.toLowStockRow(stock)),
      meta: buildMeta(page, limit, total),
    };
  }

  async evaluateChanges(changes: StockQuantityChange[]) {
    for (const change of changes) {
      await this.evaluate(
        change.locationId,
        change.itemId,
        change.previousQuantity,
      );
    }
  }

  async evaluate(locationId: string, itemId: string, previousQuantity: number) {
    const stock = await this.stockRepo.findOne({
      where: { locationId, itemId },
      relations: { item: true, location: true },
    });
    if (!stock) return;

    const current = parseFloat(stock.quantity);
    const reorderPoint =
      stock.reorderPoint != null ? parseFloat(stock.reorderPoint) : null;

    if (current <= 0 && previousQuantity > 0) {
      await this.sendAlert(stock, {
        title: 'Out of stock',
        message: `${stock.item.description} at ${stock.location.name}: out of stock (0 remaining)`,
        alertKind: 'out_of_stock',
        current,
        previousQuantity,
        reorderPoint,
      });
      return;
    }

    if (
      reorderPoint != null &&
      reorderPoint > 0 &&
      current <= reorderPoint &&
      previousQuantity > reorderPoint
    ) {
      await this.sendAlert(stock, {
        title: 'Low stock',
        message: `${stock.item.description} at ${stock.location.name}: ${current} remaining (reorder point: ${reorderPoint})`,
        alertKind: 'below_reorder_point',
        current,
        previousQuantity,
        reorderPoint,
      });
    }
  }

  /** Notify when stock is already low and reorder point is newly set or raised. */
  async evaluateAfterReorderPointChange(stockId: string) {
    const stock = await this.stockRepo.findOne({
      where: { id: stockId },
      relations: { item: true, location: true },
    });
    if (!stock || stock.reorderPoint == null) return;

    const current = parseFloat(stock.quantity);
    const reorderPoint = parseFloat(stock.reorderPoint);
    if (reorderPoint <= 0 || current > reorderPoint) return;

    await this.sendAlert(stock, {
      title: current <= 0 ? 'Out of stock' : 'Low stock',
      message:
        current <= 0
          ? `${stock.item.description} at ${stock.location.name}: out of stock (0 remaining)`
          : `${stock.item.description} at ${stock.location.name}: ${current} remaining (reorder point: ${reorderPoint})`,
      alertKind: current <= 0 ? 'out_of_stock' : 'below_reorder_point',
      current,
      previousQuantity: current,
      reorderPoint,
    });
  }

  /** Notify when new stock is created already at/below reorder point. */
  async evaluateInitialStock(stockId: string) {
    await this.evaluateAfterReorderPointChange(stockId);
  }

  private async sendAlert(
    stock: StockLevel,
    params: {
      title: string;
      message: string;
      alertKind: string;
      current: number;
      previousQuantity: number;
      reorderPoint: number | null;
    },
  ) {
    await this.notifications.notifyUsersWithPermission('inventory.read', {
      module: 'inventory',
      type: NotificationType.LOW_STOCK,
      title: params.title,
      message: params.message,
      entityType: 'stock_level',
      entityId: stock.id,
      metadata: {
        alertKind: params.alertKind,
        locationId: stock.locationId,
        itemId: stock.itemId,
        quantity: params.current,
        reorderPoint: params.reorderPoint,
        previousQuantity: params.previousQuantity,
      },
    });
  }

  private toLowStockRow(stock: StockLevel) {
    const quantity = parseFloat(stock.quantity);
    const reorderPoint =
      stock.reorderPoint != null ? parseFloat(stock.reorderPoint) : null;

    return {
      id: stock.id,
      locationId: stock.locationId,
      itemId: stock.itemId,
      quantity: stock.quantity,
      reorderPoint: stock.reorderPoint,
      purchasePrice: stock.purchasePrice,
      status: quantity <= 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK',
      item: stock.item
        ? {
            id: stock.item.id,
            sku: stock.item.sku,
            description: stock.item.description,
            unit: stock.item.unit,
          }
        : null,
      location: stock.location
        ? {
            id: stock.location.id,
            name: stock.location.name,
            type: stock.location.type,
          }
        : null,
      shortage:
        reorderPoint != null && quantity > 0
          ? Math.max(reorderPoint - quantity, 0).toFixed(3)
          : null,
    };
  }
}
