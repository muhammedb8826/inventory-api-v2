import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TransferStatus } from '../common/enums';
import {
  applyDateRangeToQb,
  applyIlikeSearch,
  paginatedQueryBuilder,
} from '../common/utils/query.util';
import { StockTransferListQueryDto } from './dto/stock-transfer-list-query.dto';
import { StockTransferLine } from '../database/entities/stock-transfer-line.entity';
import { StockTransfer } from '../database/entities/stock-transfer.entity';
import { StockService } from '../inventory/stock.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  LowStockService,
  StockQuantityChange,
} from '../notifications/low-stock.service';
import { CreateStockTransferDto } from './dto/stock-transfer.dto';

@Injectable()
export class StockTransfersService {
  constructor(
    @InjectRepository(StockTransfer)
    private readonly transferRepo: Repository<StockTransfer>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly stockService: StockService,
    private readonly notifications: NotificationsService,
    private readonly lowStockService: LowStockService,
  ) {}

  findAll(query: StockTransferListQueryDto) {
    const qb = this.transferRepo
      .createQueryBuilder('transfer')
      .leftJoinAndSelect('transfer.fromLocation', 'fromLocation')
      .leftJoinAndSelect('transfer.toLocation', 'toLocation')
      .leftJoinAndSelect('transfer.lines', 'lines')
      .leftJoinAndSelect('lines.item', 'item')
      .orderBy('transfer.created_at', 'DESC');

    if (query.fromLocationId) {
      qb.andWhere('transfer.from_location_id = :fromLocationId', {
        fromLocationId: query.fromLocationId,
      });
    }
    if (query.toLocationId) {
      qb.andWhere('transfer.to_location_id = :toLocationId', {
        toLocationId: query.toLocationId,
      });
    }
    if (query.status) {
      qb.andWhere('transfer.status = :status', { status: query.status });
    }
    applyIlikeSearch(qb, query.search, ['transfer.notes']);
    applyDateRangeToQb(qb, 'transfer.created_at', query.from, query.to);

    return paginatedQueryBuilder(qb, query.page, query.limit);
  }

  findOne(id: string) {
    return this.transferRepo.findOne({
      where: { id },
      relations: {
        fromLocation: true,
        toLocation: true,
        lines: { item: true },
      },
    });
  }

  async create(dto: CreateStockTransferDto, userId?: string) {
    if (dto.fromLocationId === dto.toLocationId) {
      throw new BadRequestException('Source and destination must differ');
    }

    const stockChanges: StockQuantityChange[] = [];

    const transferId = await this.dataSource.transaction(async (manager) => {
      const transferRepo = manager.getRepository(StockTransfer);

      const transfer = await transferRepo.save(
        transferRepo.create({
          fromLocationId: dto.fromLocationId,
          toLocationId: dto.toLocationId,
          notes: dto.notes ?? null,
          status: TransferStatus.PENDING,
          createdById: userId ?? null,
          lines: dto.lines.map((l) =>
            Object.assign(new StockTransferLine(), {
              itemId: l.itemId,
              quantity: l.quantity.toFixed(3),
            }),
          ),
        }),
      );

      for (const line of dto.lines) {
        const previousQuantity = await this.stockService.getQuantity(
          dto.fromLocationId,
          line.itemId,
          manager,
        );
        await this.stockService.transfer(
          dto.fromLocationId,
          dto.toLocationId,
          line.itemId,
          line.quantity,
          manager,
        );
        stockChanges.push({
          locationId: dto.fromLocationId,
          itemId: line.itemId,
          previousQuantity,
        });
      }

      transfer.status = TransferStatus.COMPLETED;
      await transferRepo.save(transfer);
      return transfer.id;
    });

    await this.lowStockService.evaluateChanges(stockChanges);

    const transfer = await this.findOne(transferId);
    if (!transfer) throw new NotFoundException('Stock transfer not found');

    await this.notifications.onStockTransferCompleted({
      transferId,
      fromLocationName: transfer.fromLocation?.name ?? 'Unknown',
      toLocationName: transfer.toLocation?.name ?? 'Unknown',
      lineCount: transfer.lines.length,
      actorUserId: userId,
    });

    return transfer;
  }

  async void(id: string) {
    const transfer = await this.transferRepo.findOne({
      where: { id },
      relations: { lines: true },
    });
    if (!transfer) throw new NotFoundException('Stock transfer not found');
    if (transfer.status !== TransferStatus.COMPLETED) {
      throw new BadRequestException('Only completed transfers can be voided');
    }

    await this.dataSource.transaction(async (manager) => {
      const transferRepo = manager.getRepository(StockTransfer);
      for (const line of transfer.lines) {
        await this.stockService.transfer(
          transfer.toLocationId,
          transfer.fromLocationId,
          line.itemId,
          parseFloat(line.quantity),
          manager,
        );
      }
      transfer.status = TransferStatus.CANCELLED;
      await transferRepo.save(transfer);
    });

    return this.findOne(id);
  }
}
