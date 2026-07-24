import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ProductionOrderStatus } from '../common/enums';
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
import {
  CompleteProductionDto,
  CreateProductionOrderDto,
  IssueProductionDto,
  ProductionOrderListQueryDto,
} from './dto/production-order.dto';

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
        finishedItem: true,
        location: true,
        bom: true,
        createdBy: true,
        lines: { componentItem: true },
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
    if (!bom.lines?.length) {
      throw new BadRequestException('BOM has no component lines');
    }

    const location = await this.locationRepo.findOne({
      where: { id: dto.locationId },
    });
    if (!location) throw new BadRequestException('Location not found');

    const order = await this.orderRepo.save(
      this.orderRepo.create({
        bomId: bom.id,
        finishedItemId: bom.finishedItemId,
        locationId: dto.locationId,
        quantityPlanned: dto.quantityPlanned.toFixed(3),
        quantityCompleted: '0.000',
        status: ProductionOrderStatus.DRAFT,
        notes: dto.notes?.trim() || null,
        createdById: userId ?? null,
        lines: bom.lines.map((line) => {
          const scrap = parseFloat(line.scrapPercent) || 0;
          const perUnit = parseFloat(line.quantity) * (1 + scrap / 100);
          const required = perUnit * dto.quantityPlanned;
          return Object.assign(new ProductionOrderLine(), {
            componentItemId: line.componentItemId,
            quantityRequired: required.toFixed(3),
            quantityIssued: '0.000',
          });
        }),
      }),
    );

    return this.findOne(order.id);
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
          'Completed or cancelled orders cannot be cancelled',
        );
      }
      if (parseFloat(order.quantityCompleted) > 0) {
        throw new BadRequestException(
          'Cannot cancel an order with completed finished goods; reverse via stock adjustment if needed',
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
