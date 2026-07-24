import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  BankTransactionType,
  CommissionBasis,
  CreditStatus,
  DEFAULT_COMMISSION_PERCENT,
  DocumentStatus,
  PaymentMethod,
} from '../common/enums';
import { computeCommissionAmount } from '../common/utils/commission.util';
import {
  applyDateRangeToQb,
  applyRelatedIlikeSearch,
  paginatedQueryBuilder,
  sumFilteredQueryBuilder,
} from '../common/utils/query.util';
import { SalesListQueryDto } from './dto/sales-list-query.dto';
import { BankLedgerService } from '../banks/bank-ledger.service';
import { BanksService } from '../banks/banks.service';
import { CustomerCredit } from '../database/entities/customer-credit.entity';
import { SaleLine } from '../database/entities/sale-line.entity';
import { Sale } from '../database/entities/sale.entity';
import { User } from '../database/entities/user.entity';
import { StockService } from '../inventory/stock.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  LowStockService,
  StockQuantityChange,
} from '../notifications/low-stock.service';
import { CommissionSummaryQueryDto } from './dto/commission-summary-query.dto';
import { CreateSaleDto, SaleLineDto } from './dto/sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';

type SaleCommissionLineInput = Pick<
  SaleLine,
  'quantity' | 'lineTotal' | 'purchaseCost' | 'unitPrice'
>;

type SaleLineDraft = Pick<
  SaleLine,
  'itemId' | 'quantity' | 'unitPrice' | 'purchaseCost' | 'lineTotal'
>;

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(Sale)
    private readonly saleRepo: Repository<Sale>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly stockService: StockService,
    private readonly bankLedger: BankLedgerService,
    private readonly banksService: BanksService,
    private readonly notifications: NotificationsService,
    private readonly lowStockService: LowStockService,
  ) {}

  async findAll(query: SalesListQueryDto) {
    const filteredQb = this.buildSalesFilterQb(query);
    const [totals, page] = await Promise.all([
      sumFilteredQueryBuilder(filteredQb, [
        { key: 'subtotal', sql: 'COALESCE(SUM(sale.subtotal::numeric), 0)' },
        { key: 'total', sql: 'COALESCE(SUM(sale.total::numeric), 0)' },
        {
          key: 'commission',
          sql: 'COALESCE(SUM(sale.commission_amount::numeric), 0)',
        },
      ]),
      paginatedQueryBuilder(
        filteredQb
          .clone()
          .leftJoinAndSelect('sale.customer', 'customer')
          .leftJoinAndSelect('sale.location', 'location')
          .leftJoinAndSelect('sale.lines', 'lines')
          .leftJoinAndSelect('lines.item', 'item')
          .leftJoinAndSelect('sale.credit', 'credit')
          .leftJoinAndSelect('sale.soldByUser', 'soldByUser')
          .orderBy('sale.created_at', 'DESC'),
        query.page,
        query.limit,
      ),
    ]);

    return { ...page, totals };
  }

  private buildSalesFilterQb(query: SalesListQueryDto) {
    const includeVoided = query.includeVoided === 'true';
    const qb = this.saleRepo.createQueryBuilder('sale');

    if (!includeVoided) {
      qb.andWhere('sale.status = :status', { status: DocumentStatus.ACTIVE });
    }
    if (query.soldByUserId) {
      qb.andWhere('sale.sold_by_user_id = :soldByUserId', {
        soldByUserId: query.soldByUserId,
      });
    }
    if (query.customerId) {
      qb.andWhere('sale.customer_id = :customerId', {
        customerId: query.customerId,
      });
    }
    if (query.locationId) {
      qb.andWhere('sale.location_id = :locationId', {
        locationId: query.locationId,
      });
    }
    if (query.paymentMethod) {
      qb.andWhere('sale.paymentMethod = :paymentMethod', {
        paymentMethod: query.paymentMethod,
      });
    }
    applyRelatedIlikeSearch(qb, query.search, ['sale.notes'], {
      table: 'customers',
      alias: 'customer_filter',
      parentKey: 'sale.customer_id',
      relatedKey: 'id',
      columns: ['name', 'phone'],
    });
    applyDateRangeToQb(qb, 'sale.created_at', query.from, query.to);

    return qb;
  }

  async findOne(id: string) {
    const sale = await this.saleRepo.findOne({
      where: { id },
      relations: {
        customer: true,
        location: true,
        lines: { item: true },
        credit: true,
        soldByUser: true,
      },
    });
    if (!sale) throw new NotFoundException('Sale not found');
    return sale;
  }

  async commissionSummary(query: CommissionSummaryQueryDto) {
    const qb = this.saleRepo
      .createQueryBuilder('sale')
      .leftJoin('sale.soldByUser', 'rep')
      .select('sale.sold_by_user_id', 'soldByUserId')
      .addSelect('rep.full_name', 'soldByUserName')
      .addSelect('COUNT(sale.id)', 'saleCount')
      .addSelect('COALESCE(SUM(sale.subtotal), 0)', 'totalSubtotal')
      .addSelect('COALESCE(SUM(sale.commission_amount), 0)', 'totalCommission')
      .where('sale.status = :status', { status: DocumentStatus.ACTIVE })
      .groupBy('sale.sold_by_user_id')
      .addGroupBy('rep.full_name')
      .orderBy('SUM(sale.commission_amount)', 'DESC');

    applyDateRangeToQb(qb, 'sale.created_at', query.from, query.to);

    if (query.soldByUserId) {
      qb.andWhere('sale.sold_by_user_id = :soldByUserId', {
        soldByUserId: query.soldByUserId,
      });
    }

    const rows = await qb.getRawMany<{
      soldByUserId: string | null;
      soldByUserName: string | null;
      saleCount: string;
      totalSubtotal: string;
      totalCommission: string;
    }>();

    return rows.map((row) => ({
      soldByUserId: row.soldByUserId,
      soldByUserName: row.soldByUserName,
      saleCount: parseInt(row.saleCount, 10),
      totalSubtotal: parseFloat(row.totalSubtotal).toFixed(2),
      totalCommission: parseFloat(row.totalCommission).toFixed(2),
    }));
  }

  private readonly structuralUpdateKeys: (keyof UpdateSaleDto)[] = [
    'customerId',
    'locationId',
    'paymentMethod',
    'bankAccountId',
    'allowNegativeStock',
    'creditDueDate',
    'lines',
  ];

  private isMetadataOnlyUpdate(dto: UpdateSaleDto): boolean {
    const keys = (Object.keys(dto) as (keyof UpdateSaleDto)[]).filter(
      (k) => dto[k] !== undefined,
    );
    return (
      keys.length > 0 &&
      !keys.some((k) => this.structuralUpdateKeys.includes(k))
    );
  }

  private lineProfit(lines: SaleCommissionLineInput[]): number {
    return lines.reduce((total, line) => {
      const qty = parseFloat(line.quantity);
      const purchaseCost = parseFloat(line.purchaseCost);
      const revenue = parseFloat(line.lineTotal);
      return total + revenue - qty * purchaseCost;
    }, 0);
  }

  private commissionFields(
    subtotal: number,
    lines: SaleCommissionLineInput[],
    opts: {
      commissionPercent?: number;
      existingPercent?: string;
      commissionBasis?: CommissionBasis;
      existingBasis?: CommissionBasis;
    },
  ) {
    const pct =
      opts.commissionPercent ??
      (opts.existingPercent !== undefined
        ? parseFloat(opts.existingPercent)
        : DEFAULT_COMMISSION_PERCENT);
    const basis: CommissionBasis =
      opts.commissionBasis ?? opts.existingBasis ?? CommissionBasis.PROFIT;
    const profit: number = this.lineProfit(lines);
    return {
      commissionPercent: pct.toFixed(2),
      commissionBasis: basis,
      commissionAmount: computeCommissionAmount(basis, subtotal, profit, pct),
    };
  }

  private async resolveSoldByUserId(
    requested: string | undefined,
    actorId: string | undefined,
    canOnBehalf: boolean,
    manager?: EntityManager,
  ): Promise<string | null> {
    const userRepo = manager ? manager.getRepository(User) : this.userRepo;
    const targetId = requested ?? actorId ?? null;
    if (!targetId) return null;

    if (requested && requested !== actorId && !canOnBehalf) {
      throw new ForbiddenException(
        'sales.on_behalf permission required to sell for another user',
      );
    }

    const user = await userRepo.findOne({
      where: { id: targetId, isActive: true },
    });
    if (!user) {
      throw new BadRequestException('Sold-by user not found or inactive');
    }
    return targetId;
  }

  private resolveLines(sale: Sale, dto: UpdateSaleDto): SaleLineDto[] {
    if (dto.lines) return dto.lines;
    return sale.lines.map((l) => ({
      itemId: l.itemId,
      quantity: parseFloat(l.quantity),
      unitPrice: parseFloat(l.unitPrice),
    }));
  }

  private paysViaBank(method: PaymentMethod): boolean {
    return method === PaymentMethod.BANK || method === PaymentMethod.CASH;
  }

  async update(
    id: string,
    dto: UpdateSaleDto,
    userId?: string,
    canNegativeStock = false,
    canOnBehalf = false,
  ) {
    if (this.isMetadataOnlyUpdate(dto)) {
      const sale = await this.findOne(id);
      if (sale.status === DocumentStatus.VOIDED) {
        throw new BadRequestException('Cannot update a voided sale');
      }
      if (sale.credit) {
        const paid = parseFloat(sale.credit.paidAmount);
        if (paid > 0) {
          const keys = (Object.keys(dto) as (keyof UpdateSaleDto)[]).filter(
            (k) => dto[k] !== undefined,
          );
          if (keys.some((k) => k !== 'notes')) {
            throw new BadRequestException(
              'Cannot change sale after customer credit payments; only notes may be updated',
            );
          }
        }
      }

      if (dto.notes !== undefined) {
        sale.notes = dto.notes ?? null;
      }

      const subtotal = parseFloat(sale.subtotal);
      if (
        dto.soldByUserId !== undefined ||
        dto.commissionPercent !== undefined ||
        dto.commissionBasis !== undefined
      ) {
        sale.soldByUserId = await this.resolveSoldByUserId(
          dto.soldByUserId ?? sale.soldByUserId ?? undefined,
          userId,
          canOnBehalf,
        );
        const commission = this.commissionFields(subtotal, sale.lines, {
          commissionPercent: dto.commissionPercent,
          existingPercent: sale.commissionPercent,
          commissionBasis: dto.commissionBasis,
          existingBasis: sale.commissionBasis,
        });
        sale.commissionPercent = commission.commissionPercent;
        sale.commissionBasis = commission.commissionBasis;
        sale.commissionAmount = commission.commissionAmount;
      }

      await this.saleRepo.save(sale);
      return this.findOne(id);
    }

    const hasFields = (Object.keys(dto) as (keyof UpdateSaleDto)[]).some(
      (k) => dto[k] !== undefined,
    );
    if (!hasFields) return this.findOne(id);

    const allowNegative =
      dto.allowNegativeStock !== undefined
        ? dto.allowNegativeStock === true
        : undefined;

    if (allowNegative === true && !canNegativeStock) {
      throw new ForbiddenException(
        'sales.negative_stock permission required for negative stock sales',
      );
    }

    let stockWarnings: string[] = [];
    const stockChanges: StockQuantityChange[] = [];

    await this.dataSource.transaction(async (manager) => {
      const saleRepo = manager.getRepository(Sale);
      const lineRepo = manager.getRepository(SaleLine);
      const creditRepo = manager.getRepository(CustomerCredit);

      const sale = await saleRepo.findOne({
        where: { id },
        relations: { lines: true, credit: true },
      });
      if (!sale) throw new NotFoundException('Sale not found');
      if (sale.status === DocumentStatus.VOIDED) {
        throw new BadRequestException('Cannot update a voided sale');
      }

      if (sale.credit) {
        const paid = parseFloat(sale.credit.paidAmount);
        if (paid > 0) {
          throw new BadRequestException(
            'Cannot change sale after customer credit payments; only notes may be updated',
          );
        }
      }

      const customerId =
        dto.customerId !== undefined ? dto.customerId : sale.customerId;
      const locationId = dto.locationId ?? sale.locationId;
      const paymentMethod = dto.paymentMethod ?? sale.paymentMethod;
      const bankAccountId =
        dto.bankAccountId !== undefined
          ? dto.bankAccountId
          : sale.bankAccountId;
      const allowNeg =
        allowNegative !== undefined ? allowNegative : sale.allowNegativeStock;
      const notes = dto.notes !== undefined ? (dto.notes ?? null) : sale.notes;
      const creditDueDate =
        dto.creditDueDate !== undefined
          ? dto.creditDueDate
          : (sale.credit?.dueDate ?? undefined);
      const lines = this.resolveLines(sale, dto);

      if (this.paysViaBank(paymentMethod) && !bankAccountId) {
        throw new BadRequestException(
          'bankAccountId required for BANK and CASH payments',
        );
      }
      if (paymentMethod === PaymentMethod.CREDIT && !customerId) {
        throw new BadRequestException('customerId required for credit sales');
      }
      if (this.paysViaBank(paymentMethod) && bankAccountId) {
        await this.banksService.assertPaymentAccount(
          paymentMethod,
          bankAccountId,
          manager,
        );
      }

      const subtotal = lines.reduce(
        (sum, l) => sum + l.quantity * l.unitPrice,
        0,
      );

      const oldLocationId = sale.locationId;
      const oldPaymentMethod = sale.paymentMethod;
      const oldBankAccountId = sale.bankAccountId;

      for (const line of sale.lines) {
        await this.stockService.adjust(
          {
            locationId: oldLocationId,
            itemId: line.itemId,
            quantityDelta: parseFloat(line.quantity),
          },
          manager,
        );
      }

      stockWarnings = await this.stockService.checkAvailability(
        locationId,
        lines,
        allowNeg,
        manager,
      );

      if (this.paysViaBank(oldPaymentMethod) && oldBankAccountId) {
        await this.bankLedger.reverseByReference(
          'sale',
          sale.id,
          `Adjust sale ${sale.id}`,
          userId,
          manager,
        );
      }

      if (sale.credit) {
        await creditRepo.remove(sale.credit);
      }

      await lineRepo.delete({ saleId: sale.id });

      const saleLines: SaleLineDraft[] = [];
      for (const line of lines) {
        const stock = await this.stockService.getStock(
          locationId,
          line.itemId,
          manager,
        );
        const purchaseCost = stock ? parseFloat(stock.purchasePrice) : 0;
        const lineTotal = line.quantity * line.unitPrice;
        saleLines.push({
          itemId: line.itemId,
          quantity: line.quantity.toFixed(3),
          unitPrice: line.unitPrice.toFixed(2),
          purchaseCost: purchaseCost.toFixed(2),
          lineTotal: lineTotal.toFixed(2),
        });
      }

      sale.customerId = customerId ?? null;
      sale.locationId = locationId;
      sale.paymentMethod = paymentMethod;
      sale.bankAccountId = bankAccountId ?? null;
      sale.allowNegativeStock = allowNeg;
      sale.subtotal = subtotal.toFixed(2);
      sale.total = subtotal.toFixed(2);
      sale.notes = notes;
      sale.stockWarnings = stockWarnings.length ? stockWarnings : null;
      sale.lines = saleLines.map((l) => Object.assign(new SaleLine(), l));
      sale.soldByUserId = await this.resolveSoldByUserId(
        dto.soldByUserId ?? sale.soldByUserId ?? undefined,
        userId,
        canOnBehalf,
        manager,
      );
      const commission = this.commissionFields(subtotal, saleLines, {
        commissionPercent: dto.commissionPercent,
        existingPercent: sale.commissionPercent,
        commissionBasis: dto.commissionBasis,
        existingBasis: sale.commissionBasis,
      });
      sale.commissionPercent = commission.commissionPercent;
      sale.commissionBasis = commission.commissionBasis;
      sale.commissionAmount = commission.commissionAmount;

      await saleRepo.save(sale);

      for (const line of lines) {
        const previousQuantity = await this.stockService.getQuantity(
          locationId,
          line.itemId,
          manager,
        );
        await this.stockService.adjust(
          {
            locationId,
            itemId: line.itemId,
            quantityDelta: -line.quantity,
          },
          manager,
        );
        stockChanges.push({
          locationId,
          itemId: line.itemId,
          previousQuantity,
        });
      }

      if (this.paysViaBank(paymentMethod) && bankAccountId) {
        await this.bankLedger.recordTransaction(
          {
            bankAccountId,
            type: BankTransactionType.SALE,
            amount: subtotal,
            direction: 'in',
            description: `Sale ${sale.id}`,
            refType: 'sale',
            refId: sale.id,
            createdById: userId,
          },
          manager,
        );
      }

      if (paymentMethod === PaymentMethod.CREDIT && customerId) {
        await creditRepo.save(
          creditRepo.create({
            customerId,
            saleId: sale.id,
            amount: subtotal.toFixed(2),
            paidAmount: '0',
            balance: subtotal.toFixed(2),
            status: CreditStatus.OPEN,
            dueDate: creditDueDate ?? null,
          }),
        );
      }
    });

    const sale = await this.findOne(id);
    await this.lowStockService.evaluateChanges(stockChanges);
    await this.notifications.onSaleRecorded({
      saleId: id,
      total: sale.total,
      actorUserId: userId,
      soldByUserId: sale.soldByUserId,
      stockWarnings: stockWarnings.length ? stockWarnings : undefined,
      creditDueDate: sale.credit?.dueDate ?? null,
    });
    if (stockWarnings.length) {
      return { ...sale, stockWarnings };
    }
    return sale;
  }

  async void(id: string, userId?: string) {
    await this.dataSource.transaction(async (manager) => {
      const saleRepo = manager.getRepository(Sale);
      const creditRepo = manager.getRepository(CustomerCredit);

      const sale = await saleRepo.findOne({
        where: { id },
        relations: { lines: true, credit: true },
      });
      if (!sale) throw new NotFoundException('Sale not found');
      if (sale.status === DocumentStatus.VOIDED) {
        throw new BadRequestException('Sale already voided');
      }

      if (sale.credit) {
        const paid = parseFloat(sale.credit.paidAmount);
        if (paid > 0) {
          throw new BadRequestException(
            'Cannot void sale with customer credit payments applied',
          );
        }
        await creditRepo.remove(sale.credit);
      }

      for (const line of sale.lines) {
        await this.stockService.adjust(
          {
            locationId: sale.locationId,
            itemId: line.itemId,
            quantityDelta: parseFloat(line.quantity),
          },
          manager,
        );
      }

      const paysViaBank =
        sale.paymentMethod === PaymentMethod.BANK ||
        sale.paymentMethod === PaymentMethod.CASH;
      if (paysViaBank && sale.bankAccountId) {
        await this.bankLedger.reverseByReference(
          'sale',
          sale.id,
          `Void sale ${sale.id}`,
          userId,
          manager,
        );
      }

      sale.status = DocumentStatus.VOIDED;
      sale.voidedAt = new Date();
      await saleRepo.save(sale);
    });

    return this.findOne(id);
  }

  async create(
    dto: CreateSaleDto,
    userId?: string,
    canNegativeStock = false,
    canOnBehalf = false,
  ) {
    const allowNegative = dto.allowNegativeStock === true;
    if (allowNegative && !canNegativeStock) {
      throw new ForbiddenException(
        'sales.negative_stock permission required for negative stock sales',
      );
    }

    const paysViaBank =
      dto.paymentMethod === PaymentMethod.BANK ||
      dto.paymentMethod === PaymentMethod.CASH;
    if (paysViaBank && !dto.bankAccountId) {
      throw new BadRequestException(
        'bankAccountId required for BANK and CASH payments',
      );
    }
    if (dto.paymentMethod === PaymentMethod.CREDIT && !dto.customerId) {
      throw new BadRequestException('customerId required for credit sales');
    }

    const stockChanges: StockQuantityChange[] = [];

    const result = await this.dataSource.transaction(async (manager) => {
      if (paysViaBank && dto.bankAccountId) {
        await this.banksService.assertPaymentAccount(
          dto.paymentMethod,
          dto.bankAccountId,
          manager,
        );
      }

      const saleRepo = manager.getRepository(Sale);
      const creditRepo = manager.getRepository(CustomerCredit);

      const stockWarnings = await this.stockService.checkAvailability(
        dto.locationId,
        dto.lines,
        allowNegative,
        manager,
      );

      const saleLines: SaleLineDraft[] = [];
      let subtotal = 0;

      for (const line of dto.lines) {
        const stock = await this.stockService.getStock(
          dto.locationId,
          line.itemId,
          manager,
        );
        const purchaseCost = stock ? parseFloat(stock.purchasePrice) : 0;
        const lineTotal = line.quantity * line.unitPrice;
        subtotal += lineTotal;
        saleLines.push({
          itemId: line.itemId,
          quantity: line.quantity.toFixed(3),
          unitPrice: line.unitPrice.toFixed(2),
          purchaseCost: purchaseCost.toFixed(2),
          lineTotal: lineTotal.toFixed(2),
        });
      }

      const soldByUserId = await this.resolveSoldByUserId(
        dto.soldByUserId,
        userId,
        canOnBehalf,
        manager,
      );
      const commission = this.commissionFields(subtotal, saleLines, {
        commissionPercent: dto.commissionPercent,
        commissionBasis: dto.commissionBasis,
      });

      const sale = await saleRepo.save(
        saleRepo.create({
          customerId: dto.customerId ?? null,
          locationId: dto.locationId,
          paymentMethod: dto.paymentMethod,
          bankAccountId: dto.bankAccountId ?? null,
          allowNegativeStock: allowNegative,
          subtotal: subtotal.toFixed(2),
          total: subtotal.toFixed(2),
          notes: dto.notes ?? null,
          stockWarnings: stockWarnings.length ? stockWarnings : null,
          status: DocumentStatus.ACTIVE,
          createdById: userId ?? null,
          soldByUserId,
          commissionPercent: commission.commissionPercent,
          commissionBasis: commission.commissionBasis,
          commissionAmount: commission.commissionAmount,
          lines: saleLines.map((l) => Object.assign(new SaleLine(), l)),
        }),
      );

      for (const line of dto.lines) {
        const previousQuantity = await this.stockService.getQuantity(
          dto.locationId,
          line.itemId,
          manager,
        );
        await this.stockService.adjust(
          {
            locationId: dto.locationId,
            itemId: line.itemId,
            quantityDelta: -line.quantity,
          },
          manager,
        );
        stockChanges.push({
          locationId: dto.locationId,
          itemId: line.itemId,
          previousQuantity,
        });
      }

      if (paysViaBank && dto.bankAccountId) {
        await this.bankLedger.recordTransaction(
          {
            bankAccountId: dto.bankAccountId,
            type: BankTransactionType.SALE,
            amount: subtotal,
            direction: 'in',
            description: `Sale ${sale.id}`,
            refType: 'sale',
            refId: sale.id,
            createdById: userId,
          },
          manager,
        );
      }

      if (dto.paymentMethod === PaymentMethod.CREDIT && dto.customerId) {
        await creditRepo.save(
          creditRepo.create({
            customerId: dto.customerId,
            saleId: sale.id,
            amount: subtotal.toFixed(2),
            paidAmount: '0',
            balance: subtotal.toFixed(2),
            status: CreditStatus.OPEN,
            dueDate: dto.creditDueDate ?? null,
          }),
        );
      }

      return {
        saleId: sale.id,
        stockWarnings,
        soldByUserId,
        subtotal: subtotal.toFixed(2),
        creditDueDate: dto.creditDueDate ?? null,
      };
    });

    const sale = await this.findOne(result.saleId);
    await this.lowStockService.evaluateChanges(stockChanges);
    await this.notifications.onSaleRecorded({
      saleId: result.saleId,
      total: result.subtotal,
      actorUserId: userId,
      soldByUserId: result.soldByUserId,
      stockWarnings: result.stockWarnings,
      creditDueDate: result.creditDueDate,
    });

    return {
      ...sale,
      stockWarnings: result.stockWarnings,
    };
  }
}
