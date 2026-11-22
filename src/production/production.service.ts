import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import {
  BomType,
  ProductionOrderStatus,
  StockMovementRefType,
} from '../common/enums';
import {
  applyDateRangeToQb,
  applyIlikeSearch,
  paginatedQueryBuilder,
} from '../common/utils/query.util';
import { Bom } from '../database/entities/bom.entity';
import { Item } from '../database/entities/item.entity';
import { Location } from '../database/entities/location.entity';
import { ProductionOrderLine } from '../database/entities/production-order-line.entity';
import { ProductionOrder } from '../database/entities/production-order.entity';
import { StockService } from '../inventory/stock.service';
import { LowStockService } from '../notifications/low-stock.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CompleteProductionDto,
  CreateProductionOrderDto,
  IssueProductionDto,
  ProductionOrderListQueryDto,
} from './dto/production-order.dto';
import { ManufactureExplodeService } from './manufacture-explode.service';

export type SaleShortageLine = {
  itemId: string;
  quantityNeeded: number;
  /** Kit sales deduct components — skip MTO for the kit parent. */
  isKit: boolean;
};

@Injectable()
export class ProductionService {
  constructor(
    @InjectRepository(ProductionOrder)
    private readonly orderRepo: Repository<ProductionOrder>,
    @InjectRepository(Bom)
    private readonly bomRepo: Repository<Bom>,
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly stockService: StockService,
    private readonly lowStockService: LowStockService,
    private readonly notifications: NotificationsService,
    private readonly manufactureExplode: ManufactureExplodeService,
  ) {}

  findAll(query: ProductionOrderListQueryDto) {
    const qb = this.orderRepo
      .createQueryBuilder('po')
      .leftJoinAndSelect('po.finishedItem', 'finishedItem')
      .leftJoinAndSelect('po.location', 'location')
      .leftJoinAndSelect('po.bom', 'bom')
      .leftJoinAndSelect('po.lines', 'lines')
      .leftJoinAndSelect('lines.componentItem', 'componentItem')
      .leftJoinAndSelect('po.createdBy', 'createdBy')
      .orderBy('po.created_at', 'DESC');

    if (query.locationId) {
      qb.andWhere('po.location_id = :locationId', {
        locationId: query.locationId,
      });
    }
    if (query.finishedItemId) {
      qb.andWhere('po.finished_item_id = :finishedItemId', {
        finishedItemId: query.finishedItemId,
      });
    }
    if (query.bomId) {
      qb.andWhere('po.bom_id = :bomId', { bomId: query.bomId });
    }
    if (query.saleId) {
      qb.andWhere('po.sale_id = :saleId', { saleId: query.saleId });
    }
    if (query.status) {
      qb.andWhere('po.status = :status', { status: query.status });
    }
    applyIlikeSearch(qb, query.search, [
      'po.notes',
      'finishedItem.description',
      'finishedItem.sku',
      'bom.name',
    ]);
    applyDateRangeToQb(qb, 'po.created_at', query.from, query.to);

    return paginatedQueryBuilder(qb, query.page, query.limit);
  }

  async findOne(id: string) {
    const order = await this.orderRepo.findOne({
      where: { id },
      relations: {
        finishedItem: { stockUom: true },
        location: true,
        bom: true,
        createdBy: true,
        sale: { customer: true },
        lines: { componentItem: { stockUom: true } },
      },
    });
    if (!order) throw new NotFoundException('Production order not found');
    return order;
  }

  async create(dto: CreateProductionOrderDto, userId?: string) {
    const bom = await this.bomRepo.findOne({
      where: { id: dto.bomId },
      relations: { lines: true, finishedItem: true },
    });
    if (!bom) throw new BadRequestException('BOM not found');
    if (!bom.isActive) throw new BadRequestException('BOM is inactive');
    if (bom.bomType === BomType.KIT) {
      throw new BadRequestException(
        'Kit BoMs cannot be produced. Use a Manufacture BoM, or sell the kit without production.',
      );
    }
    if (!bom.lines?.length) {
      throw new BadRequestException('BOM has no component lines');
    }

    const location = await this.locationRepo.findOne({
      where: { id: dto.locationId },
    });
    if (!location) throw new BadRequestException('Location not found');

    const finished = bom.finishedItem;
    if (finished?.isTemplate && !bom.variantItemId) {
      throw new BadRequestException(
        'This BoM is for a product template — set a product variant on the BoM before producing',
      );
    }
    const stockableFinishedId = bom.variantItemId ?? bom.finishedItemId;

    // Multi-level: nested Manufacture BoMs explode to leaf materials.
    const exploded = await this.manufactureExplode.explodeRootBom(
      bom,
      dto.quantityPlanned,
    );

    const order = await this.orderRepo.save(
      this.orderRepo.create({
        bomId: bom.id,
        finishedItemId: stockableFinishedId,
        locationId: dto.locationId,
        saleId: dto.saleId ?? null,
        quantityPlanned: dto.quantityPlanned.toFixed(3),
        quantityCompleted: '0.000',
        status: ProductionOrderStatus.DRAFT,
        notes: dto.notes?.trim() || null,
        createdById: userId ?? null,
        lines: exploded.map((row) =>
          Object.assign(new ProductionOrderLine(), {
            componentItemId: row.componentItemId,
            quantityRequired: row.quantityRequired.toFixed(3),
            quantityIssued: '0.000',
          }),
        ),
      }),
    );

    const created = await this.findOne(order.id);
    await this.notifications.onProductionOrderDrafted({
      productionOrderId: created.id,
      quantityPlanned: created.quantityPlanned,
      finishedItemDescription: created.finishedItem?.description,
      saleId: created.saleId,
      actorUserId: userId,
    });
    return created;
  }

  /**
   * Prefer variant-specific Manufacture BoM, then product-level, then parent
   * product BoM when the sold item is a variant.
   */
  async findActiveManufactureBom(
    itemId: string,
    manager?: EntityManager,
  ): Promise<Bom | null> {
    const bomRepo = manager ? manager.getRepository(Bom) : this.bomRepo;
    const itemRepo = manager ? manager.getRepository(Item) : this.itemRepo;

    const variantBom = await bomRepo.findOne({
      where: {
        bomType: BomType.MANUFACTURE,
        isActive: true,
        variantItemId: itemId,
      },
      relations: { lines: true, finishedItem: true },
      order: { updatedAt: 'DESC' },
    });
    if (variantBom?.lines?.length) return variantBom;

    const finishedBom = await bomRepo.findOne({
      where: {
        bomType: BomType.MANUFACTURE,
        isActive: true,
        finishedItemId: itemId,
        variantItemId: IsNull(),
      },
      relations: { lines: true, finishedItem: true },
      order: { updatedAt: 'DESC' },
    });
    if (finishedBom?.lines?.length) return finishedBom;

    const catalogItem = await itemRepo.findOne({ where: { id: itemId } });
    if (catalogItem?.parentItemId) {
      const parentBom = await bomRepo.findOne({
        where: {
          bomType: BomType.MANUFACTURE,
          isActive: true,
          finishedItemId: catalogItem.parentItemId,
          variantItemId: IsNull(),
        },
        relations: { lines: true, finishedItem: true },
        order: { updatedAt: 'DESC' },
      });
      if (parentBom?.lines?.length) return parentBom;
    }

    return null;
  }

  /**
   * Cancel open DRAFT production orders linked to a sale (e.g. before re-create
   * on sale update, or when voiding the sale).
   */
  async cancelDraftOrdersForSale(
    saleId: string,
    manager?: EntityManager,
  ): Promise<number> {
    const orderRepo = manager
      ? manager.getRepository(ProductionOrder)
      : this.orderRepo;
    const drafts = await orderRepo.find({
      where: {
        saleId,
        status: ProductionOrderStatus.DRAFT,
      },
    });
    if (!drafts.length) return 0;
    for (const order of drafts) {
      order.status = ProductionOrderStatus.CANCELLED;
    }
    await orderRepo.save(drafts);
    return drafts.length;
  }

  /**
   * For each non-kit sale line short on finished stock that has an active
   * Manufacture BoM, create a DRAFT production order linked to the sale.
   * Call before stock is deducted so available qty is still pre-sale.
   */
  async createFromSaleShortages(
    params: {
      saleId: string;
      locationId: string;
      lines: SaleShortageLine[];
      userId?: string;
    },
    manager?: EntityManager,
  ): Promise<ProductionOrder[]> {
    const orderRepo = manager
      ? manager.getRepository(ProductionOrder)
      : this.orderRepo;
    const created: ProductionOrder[] = [];
    const shortRef = params.saleId.slice(0, 8);

    for (const line of params.lines) {
      if (line.isKit) continue;
      if (!Number.isFinite(line.quantityNeeded) || line.quantityNeeded <= 0) {
        continue;
      }

      const available = await this.stockService.getQuantity(
        params.locationId,
        line.itemId,
        manager,
      );
      const shortage = line.quantityNeeded - available;
      if (shortage < 0.001) continue;

      const bom = await this.findActiveManufactureBom(line.itemId, manager);
      if (!bom?.lines?.length) continue;

      const exploded = await this.manufactureExplode.explodeRootBom(
        bom,
        shortage,
        manager,
      );
      if (!exploded.length) continue;

      const order = await orderRepo.save(
        orderRepo.create({
          bomId: bom.id,
          finishedItemId: line.itemId,
          locationId: params.locationId,
          saleId: params.saleId,
          quantityPlanned: shortage.toFixed(3),
          quantityCompleted: '0.000',
          status: ProductionOrderStatus.DRAFT,
          notes: `Auto-created from sale ${shortRef} shortage`,
          createdById: params.userId ?? null,
          lines: exploded.map((row) =>
            Object.assign(new ProductionOrderLine(), {
              componentItemId: row.componentItemId,
              quantityRequired: row.quantityRequired.toFixed(3),
              quantityIssued: '0.000',
            }),
          ),
        }),
      );
      created.push(order);
    }

    return created;
  }

  /**
   * Replace DRAFT shortage orders for a sale (cancel old drafts, create anew).
   */
  async syncSaleShortageOrders(
    params: {
      saleId: string;
      locationId: string;
      lines: SaleShortageLine[];
      userId?: string;
    },
    manager?: EntityManager,
  ): Promise<ProductionOrder[]> {
    await this.cancelDraftOrdersForSale(params.saleId, manager);
    return this.createFromSaleShortages(params, manager);
  }

  async release(id: string) {
    const order = await this.findOne(id);
    if (order.status !== ProductionOrderStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT orders can be released');
    }
    order.status = ProductionOrderStatus.RELEASED;
    order.releasedAt = new Date();
    await this.orderRepo.save(order);
    return this.findOne(id);
  }

  async issue(id: string, dto: IssueProductionDto) {
    const stockChanges: {
      locationId: string;
      itemId: string;
      previous: number;
    }[] = [];

    await this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(ProductionOrder);
      const order = await orderRepo.findOne({
        where: { id },
        relations: { lines: { componentItem: true } },
      });
      if (!order) throw new NotFoundException('Production order not found');
      if (
        order.status !== ProductionOrderStatus.RELEASED &&
        order.status !== ProductionOrderStatus.IN_PROGRESS
      ) {
        throw new BadRequestException(
          'Only RELEASED or IN_PROGRESS orders can issue materials',
        );
      }

      const issues = dto.lines?.length
        ? dto.lines
        : order.lines
            .map((line) => {
              const remaining =
                parseFloat(line.quantityRequired) -
                parseFloat(line.quantityIssued);
              return remaining > 0
                ? {
                    componentItemId: line.componentItemId,
                    quantity: remaining,
                  }
                : null;
            })
            .filter((x): x is { componentItemId: string; quantity: number } =>
              Boolean(x),
            );

      if (!issues.length) {
        throw new BadRequestException('Nothing left to issue');
      }

      const prepared: {
        line: ProductionOrderLine;
        quantity: number;
        previous: number;
      }[] = [];
      const shortages: string[] = [];

      for (const issue of issues) {
        const line = order.lines.find(
          (l) => l.componentItemId === issue.componentItemId,
        );
        if (!line) {
          const label = await this.itemLabel(issue.componentItemId, manager);
          throw new BadRequestException(
            `${label} is not a component on this production order`,
          );
        }
        const label = this.formatItemLabel(line.componentItem);
        const remaining =
          parseFloat(line.quantityRequired) - parseFloat(line.quantityIssued);
        if (issue.quantity > remaining + 1e-9) {
          throw new BadRequestException(
            `Cannot issue ${this.fmtQty(issue.quantity)} of ${label}; only ${this.fmtQty(remaining)} remaining on this order`,
          );
        }

        const previous = await this.stockService.getQuantity(
          order.locationId,
          issue.componentItemId,
          manager,
        );
        if (previous < issue.quantity) {
          shortages.push(
            `Insufficient stock for ${label}. Available: ${this.fmtQty(previous)}, requested: ${this.fmtQty(issue.quantity)}`,
          );
          continue;
        }

        prepared.push({ line, quantity: issue.quantity, previous });
      }

      if (shortages.length) {
        throw new BadRequestException(
          shortages.length === 1 ? shortages[0] : shortages,
        );
      }

      for (const row of prepared) {
        await this.stockService.adjust(
          {
            locationId: order.locationId,
            itemId: row.line.componentItemId,
            quantityDelta: -row.quantity,
            refType: StockMovementRefType.PRODUCTION,
            refId: order.id,
            notes: 'Production issue',
          },
          manager,
        );
        row.line.quantityIssued = (
          parseFloat(row.line.quantityIssued) + row.quantity
        ).toFixed(3);
        stockChanges.push({
          locationId: order.locationId,
          itemId: row.line.componentItemId,
          previous: row.previous,
        });
      }

      order.status = ProductionOrderStatus.IN_PROGRESS;
      await orderRepo.save(order);
    });

    for (const change of stockChanges) {
      await this.lowStockService.evaluate(
        change.locationId,
        change.itemId,
        change.previous,
      );
    }

    return this.findOne(id);
  }

  async complete(id: string, dto: CompleteProductionDto) {
    const autoIssue = dto.autoIssue !== false;
    const stockChanges: {
      locationId: string;
      itemId: string;
      previous: number;
    }[] = [];

    await this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(ProductionOrder);
      const order = await orderRepo.findOne({
        where: { id },
        relations: { lines: { componentItem: true } },
      });
      if (!order) throw new NotFoundException('Production order not found');
      if (
        order.status !== ProductionOrderStatus.RELEASED &&
        order.status !== ProductionOrderStatus.IN_PROGRESS
      ) {
        throw new BadRequestException(
          'Only RELEASED or IN_PROGRESS orders can be completed',
        );
      }

      const planned = parseFloat(order.quantityPlanned);
      const alreadyDone = parseFloat(order.quantityCompleted);
      const remainingFg = planned - alreadyDone;
      if (dto.quantity > remainingFg + 1e-9) {
        throw new BadRequestException(
          `Completion quantity exceeds what is left to produce. Remaining: ${this.fmtQty(remainingFg)}`,
        );
      }

      const ratio = dto.quantity / planned;

      const autoIssues: {
        line: ProductionOrderLine;
        shortfall: number;
        previous: number;
      }[] = [];
      const shortages: string[] = [];
      const notIssued: string[] = [];

      for (const line of order.lines) {
        const label = this.formatItemLabel(line.componentItem);
        const neededForThis = parseFloat(line.quantityRequired) * ratio;
        const issued = parseFloat(line.quantityIssued);
        const shortfall = neededForThis - issued;

        if (shortfall > 1e-9) {
          if (!autoIssue) {
            notIssued.push(
              `Not enough ${label} has been issued. Need ${this.fmtQty(neededForThis)}, already issued ${this.fmtQty(issued)}`,
            );
            continue;
          }
          const previous = await this.stockService.getQuantity(
            order.locationId,
            line.componentItemId,
            manager,
          );
          if (previous < shortfall) {
            shortages.push(
              `Insufficient stock for ${label}. Available: ${this.fmtQty(previous)}, needed: ${this.fmtQty(shortfall)}`,
            );
            continue;
          }
          autoIssues.push({ line, shortfall, previous });
        }
      }

      if (notIssued.length) {
        throw new BadRequestException(
          notIssued.length === 1
            ? `${notIssued[0]}. Issue materials first or set autoIssue to true`
            : [...notIssued, 'Issue materials first or set autoIssue to true'],
        );
      }
      if (shortages.length) {
        throw new BadRequestException(
          shortages.length === 1 ? shortages[0] : shortages,
        );
      }

      for (const row of autoIssues) {
        await this.stockService.adjust(
          {
            locationId: order.locationId,
            itemId: row.line.componentItemId,
            quantityDelta: -row.shortfall,
            refType: StockMovementRefType.PRODUCTION,
            refId: order.id,
            notes: 'Production complete — auto-issue',
          },
          manager,
        );
        row.line.quantityIssued = (
          parseFloat(row.line.quantityIssued) + row.shortfall
        ).toFixed(3);
        stockChanges.push({
          locationId: order.locationId,
          itemId: row.line.componentItemId,
          previous: row.previous,
        });
      }

      let unitCost = 0;
      for (const line of order.lines) {
        const neededForThis = parseFloat(line.quantityRequired) * ratio;
        const stock = await this.stockService.getStock(
          order.locationId,
          line.componentItemId,
          manager,
        );
        const price = stock ? parseFloat(stock.purchasePrice) : 0;
        unitCost += neededForThis * price;
      }
      const fgUnitCost = dto.quantity > 0 ? unitCost / dto.quantity : 0;

      const fgPrevious = await this.stockService.getQuantity(
        order.locationId,
        order.finishedItemId,
        manager,
      );
      await this.stockService.adjust(
        {
          locationId: order.locationId,
          itemId: order.finishedItemId,
          quantityDelta: dto.quantity,
          purchasePrice: fgUnitCost,
          refType: StockMovementRefType.PRODUCTION,
          refId: order.id,
          notes: 'Production complete — finished goods',
        },
        manager,
      );
      stockChanges.push({
        locationId: order.locationId,
        itemId: order.finishedItemId,
        previous: fgPrevious,
      });

      const newCompleted = alreadyDone + dto.quantity;
      order.quantityCompleted = newCompleted.toFixed(3);
      order.status =
        newCompleted >= planned - 1e-9
          ? ProductionOrderStatus.COMPLETED
          : ProductionOrderStatus.IN_PROGRESS;
      if (order.status === ProductionOrderStatus.COMPLETED) {
        order.completedAt = new Date();
      }
      await orderRepo.save(order);
    });

    for (const change of stockChanges) {
      await this.lowStockService.evaluate(
        change.locationId,
        change.itemId,
        change.previous,
      );
    }

    return this.findOne(id);
  }

  async cancel(id: string) {
    const stockChanges: {
      locationId: string;
      itemId: string;
      previous: number;
    }[] = [];

    await this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(ProductionOrder);
      const order = await orderRepo.findOne({
        where: { id },
        relations: { lines: true },
      });
      if (!order) throw new NotFoundException('Production order not found');
      if (
        order.status === ProductionOrderStatus.COMPLETED ||
        order.status === ProductionOrderStatus.CANCELLED
      ) {
        throw new BadRequestException(
          'Completed or cancelled orders cannot be cancelled. Use Reverse for completed orders.',
        );
      }
      if (parseFloat(order.quantityCompleted) > 0) {
        throw new BadRequestException(
          'Cannot cancel an order with completed finished goods; use Reverse instead',
        );
      }

      for (const line of order.lines) {
        const issued = parseFloat(line.quantityIssued);
        if (issued <= 0) continue;
        const previous = await this.stockService.getQuantity(
          order.locationId,
          line.componentItemId,
          manager,
        );
        await this.stockService.adjust(
          {
            locationId: order.locationId,
            itemId: line.componentItemId,
            quantityDelta: issued,
            refType: StockMovementRefType.PRODUCTION,
            refId: order.id,
            notes: 'Production cancel — return materials',
          },
          manager,
        );
        line.quantityIssued = '0.000';
        stockChanges.push({
          locationId: order.locationId,
          itemId: line.componentItemId,
          previous,
        });
      }

      order.status = ProductionOrderStatus.CANCELLED;
      await orderRepo.save(order);
    });

    for (const change of stockChanges) {
      await this.lowStockService.evaluate(
        change.locationId,
        change.itemId,
        change.previous,
      );
    }

    return this.findOne(id);
  }

  /**
   * Reverse a COMPLETED order: remove FG, return issued components, cancel.
   * ERP-style void of a finished production receipt.
   */
  async reverse(id: string) {
    const stockChanges: {
      locationId: string;
      itemId: string;
      previous: number;
    }[] = [];

    await this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(ProductionOrder);
      const order = await orderRepo.findOne({
        where: { id },
        relations: {
          lines: { componentItem: true },
          finishedItem: true,
        },
      });
      if (!order) throw new NotFoundException('Production order not found');
      if (order.status !== ProductionOrderStatus.COMPLETED) {
        throw new BadRequestException(
          'Only COMPLETED orders can be reversed',
        );
      }

      const completed = parseFloat(order.quantityCompleted);
      if (completed <= 0) {
        throw new BadRequestException('Nothing to reverse');
      }

      const fgPrevious = await this.stockService.getQuantity(
        order.locationId,
        order.finishedItemId,
        manager,
      );
      if (fgPrevious < completed) {
        const label = this.formatItemLabel(order.finishedItem);
        throw new BadRequestException(
          `Cannot reverse: only ${this.fmtQty(fgPrevious)} of ${label} remains in stock (need ${this.fmtQty(completed)})`,
        );
      }

      await this.stockService.adjust(
        {
          locationId: order.locationId,
          itemId: order.finishedItemId,
          quantityDelta: -completed,
          refType: StockMovementRefType.PRODUCTION,
          refId: order.id,
          notes: 'Production reverse — remove finished goods',
        },
        manager,
      );
      stockChanges.push({
        locationId: order.locationId,
        itemId: order.finishedItemId,
        previous: fgPrevious,
      });

      for (const line of order.lines) {
        const issued = parseFloat(line.quantityIssued);
        if (issued <= 0) continue;
        const previous = await this.stockService.getQuantity(
          order.locationId,
          line.componentItemId,
          manager,
        );
        await this.stockService.adjust(
          {
            locationId: order.locationId,
            itemId: line.componentItemId,
            quantityDelta: issued,
            refType: StockMovementRefType.PRODUCTION,
            refId: order.id,
            notes: 'Production reverse — return materials',
          },
          manager,
        );
        line.quantityIssued = '0.000';
        stockChanges.push({
          locationId: order.locationId,
          itemId: line.componentItemId,
          previous,
        });
      }

      order.quantityCompleted = '0.000';
      order.status = ProductionOrderStatus.CANCELLED;
      order.completedAt = null;
      await orderRepo.save(order);
    });

    for (const change of stockChanges) {
      await this.lowStockService.evaluate(
        change.locationId,
        change.itemId,
        change.previous,
      );
    }

    return this.findOne(id);
  }

  private formatItemLabel(
    item?: Pick<Item, 'description' | 'sku'> | null,
  ): string {
    if (!item) return 'Unknown item';
    const name = item.description?.trim() || 'Unnamed item';
    const sku = item.sku?.trim();
    return sku ? `${name} (${sku})` : name;
  }

  private async itemLabel(
    itemId: string,
    manager?: EntityManager,
  ): Promise<string> {
    const repo = manager ? manager.getRepository(Item) : this.itemRepo;
    const item = await repo.findOne({ where: { id: itemId } });
    return item ? this.formatItemLabel(item) : `Unknown item (${itemId})`;
  }

  private fmtQty(n: number): string {
    if (Number.isInteger(n)) return String(n);
    return parseFloat(n.toFixed(3)).toString();
  }
}
