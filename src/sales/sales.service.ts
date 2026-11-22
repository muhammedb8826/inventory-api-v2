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
  CreditSource,
  CreditStatus,
  DEFAULT_COMMISSION_PERCENT,
  DocumentStatus,
  PaymentMethod,
} from '../common/enums';
import {
  computeCommissionAmount,
  stockQtyForCost,
} from '../common/utils/commission.util';
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
import { SaleLineComponent } from '../database/entities/sale-line-component.entity';
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
import { KitSaleService } from './kit-sale.service';
import { UomConversionService } from '../uom/uom-conversion.service';
import { resolveDimensionalLine } from '../uom/resolve-dimensional-line';
import { loadItemForUom } from '../uom/resolve-line-uom';

type SaleCommissionLineInput = Pick<
  SaleLine,
  'quantity' | 'stockQuantity' | 'lineTotal' | 'purchaseCost' | 'unitPrice'
>;

type SaleLineDraft = Pick<
  SaleLine,
  | 'itemId'
  | 'quantity'
  | 'uomId'
  | 'stockQuantity'
  | 'unitPrice'
  | 'purchaseCost'
  | 'lineTotal'
  | 'dimWidth'
  | 'dimHeight'
  | 'dimPieces'
> & {
  components?: SaleLineComponent[];
};

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
    private readonly uomConversion: UomConversionService,
    private readonly kitSale: KitSaleService,
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
        lines: {
          item: { stockUom: true },
          uom: true,
          components: { componentItem: true },
        },
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
      const stockQty = stockQtyForCost(line);
      const purchaseCost = parseFloat(line.purchaseCost);
      const revenue = parseFloat(line.lineTotal);
      return total + revenue - stockQty * purchaseCost;
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
      uomId: l.uomId ?? undefined,
      unitPrice: parseFloat(l.unitPrice),
      width: l.dimWidth != null ? parseFloat(l.dimWidth) : undefined,
      height: l.dimHeight != null ? parseFloat(l.dimHeight) : undefined,
      pieces: l.dimPieces != null ? parseFloat(l.dimPieces) : undefined,
    }));
  }

  private paysViaBank(method: PaymentMethod): boolean {
    return method === PaymentMethod.BANK || method === PaymentMethod.CASH;
  }

  /**
   * Cost per stock UOM of the sold line.
   * Kits: weighted component COGS / kit stock qty. Plain items: stock purchase price.
   */
  private async kitUnitPurchaseCost(
    locationId: string,
    saleStockQuantity: number,
    moves: { itemId: string; quantity: number }[],
    manager: EntityManager,
  ): Promise<number> {
    if (moves.length === 1 && saleStockQuantity > 0) {
      const only = moves[0];
      // Same item as sold qty → unit cost is the stock purchase price.
      if (Math.abs(only.quantity - saleStockQuantity) < 1e-9) {
        const stock = await this.stockService.getStock(
          locationId,
          only.itemId,
          manager,
        );
        return stock ? parseFloat(stock.purchasePrice) : 0;
      }
    }
    let totalCost = 0;
    for (const move of moves) {
      const stock = await this.stockService.getStock(
        locationId,
        move.itemId,
        manager,
      );
      const unit = stock ? parseFloat(stock.purchasePrice) : 0;
      totalCost += unit * move.quantity;
    }
    if (saleStockQuantity <= 0) return totalCost;
    return totalCost / saleStockQuantity;
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
        relations: { lines: { components: true }, credit: true },
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

      const oldLocationId = sale.locationId;
      const oldPaymentMethod = sale.paymentMethod;
      const oldBankAccountId = sale.bankAccountId;

      for (const line of sale.lines) {
        for (const move of this.kitSale.restoreMovesForLine(line)) {
          await this.stockService.adjust(
            {
              locationId: oldLocationId,
              itemId: move.itemId,
              quantityDelta: move.quantity,
            },
            manager,
          );
        }
      }

      const resolvedLines: {
        line: (typeof lines)[number];
        dim: Awaited<ReturnType<typeof resolveDimensionalLine>>;
        explosion: Awaited<ReturnType<KitSaleService['explodeSaleLine']>>;
      }[] = [];
      for (const line of lines) {
        const item = await loadItemForUom(manager, line.itemId);
        if (!item) {
          throw new BadRequestException(`Item not found: ${line.itemId}`);
        }
        const dtoLine = line as SaleLineDto;
        const dim = await resolveDimensionalLine(
          this.uomConversion,
          item,
          'sales',
          dtoLine.quantity ?? dtoLine.pieces ?? 1,
          dtoLine.unitPrice,
          dtoLine.uomId,
          {
            width: dtoLine.width,
            height: dtoLine.height,
            pieces: dtoLine.pieces,
            dimUomId: dtoLine.uomId,
          },
        );
        const explosion = await this.kitSale.explodeSaleLine(
          line.itemId,
          dim.stockQuantity,
          manager,
        );
        resolvedLines.push({ line, dim, explosion });
      }

      const subtotal = resolvedLines.reduce((sum, l) => sum + l.dim.lineTotal, 0);

      stockWarnings = await this.stockService.checkAvailability(
        locationId,
        this.kitSale.mergeMoves(
          resolvedLines.flatMap((l) => l.explosion.moves),
        ),
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
      for (const { line, dim, explosion } of resolvedLines) {
        const purchaseCost = await this.kitUnitPurchaseCost(
          locationId,
          dim.stockQuantity,
          explosion.moves,
          manager,
        );
        saleLines.push({
          itemId: line.itemId,
          quantity: dim.quantity.toFixed(3),
          uomId: dim.uomId,
          stockQuantity: dim.stockQuantity.toFixed(3),
          unitPrice: line.unitPrice.toFixed(2),
          purchaseCost: purchaseCost.toFixed(2),
          lineTotal: dim.lineTotal.toFixed(2),
          dimWidth: dim.dimWidth != null ? dim.dimWidth.toFixed(9) : null,
          dimHeight: dim.dimHeight != null ? dim.dimHeight.toFixed(9) : null,
          dimPieces: dim.dimPieces != null ? dim.dimPieces.toFixed(3) : null,
          components: explosion.isKit
            ? explosion.moves.map((m) =>
                Object.assign(new SaleLineComponent(), {
                  componentItemId: m.itemId,
                  stockQuantity: m.quantity.toFixed(3),
                }),
              )
            : undefined,
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

      for (const { explosion } of resolvedLines) {
        for (const move of explosion.moves) {
          const previousQuantity = await this.stockService.getQuantity(
            locationId,
            move.itemId,
            manager,
          );
          await this.stockService.adjust(
            {
              locationId,
              itemId: move.itemId,
              quantityDelta: -move.quantity,
            },
            manager,
          );
          stockChanges.push({
            locationId,
            itemId: move.itemId,
            previousQuantity,
          });
        }
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
            source: CreditSource.SALE,
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
        relations: { lines: { components: true }, credit: true },
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
        for (const move of this.kitSale.restoreMovesForLine(line)) {
          await this.stockService.adjust(
            {
              locationId: sale.locationId,
              itemId: move.itemId,
              quantityDelta: move.quantity,
            },
            manager,
          );
        }
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

      const resolvedLines: {
        dto: SaleLineDto;
        dim: Awaited<ReturnType<typeof resolveDimensionalLine>>;
        explosion: Awaited<ReturnType<KitSaleService['explodeSaleLine']>>;
      }[] = [];
      for (const line of dto.lines) {
        const item = await loadItemForUom(manager, line.itemId);
        if (!item) {
          throw new BadRequestException(`Item not found: ${line.itemId}`);
        }
        const dim = await resolveDimensionalLine(
          this.uomConversion,
          item,
          'sales',
          line.quantity ?? line.pieces ?? 1,
          line.unitPrice,
          line.uomId,
          {
            width: line.width,
            height: line.height,
            pieces: line.pieces,
            dimUomId: line.uomId,
          },
        );
        const explosion = await this.kitSale.explodeSaleLine(
          line.itemId,
          dim.stockQuantity,
          manager,
        );
        resolvedLines.push({ dto: line, dim, explosion });
      }

      const stockWarnings = await this.stockService.checkAvailability(
        dto.locationId,
        this.kitSale.mergeMoves(
          resolvedLines.flatMap((l) => l.explosion.moves),
        ),
        allowNegative,
        manager,
      );

      const saleLines: SaleLineDraft[] = [];
      let subtotal = 0;

      for (const { dto: line, dim, explosion } of resolvedLines) {
        const purchaseCost = await this.kitUnitPurchaseCost(
          dto.locationId,
          dim.stockQuantity,
          explosion.moves,
          manager,
        );
        subtotal += dim.lineTotal;
        saleLines.push({
          itemId: line.itemId,
          quantity: dim.quantity.toFixed(3),
          uomId: dim.uomId,
          stockQuantity: dim.stockQuantity.toFixed(3),
          unitPrice: line.unitPrice.toFixed(2),
          purchaseCost: purchaseCost.toFixed(2),
          lineTotal: dim.lineTotal.toFixed(2),
          dimWidth: dim.dimWidth != null ? dim.dimWidth.toFixed(9) : null,
          dimHeight: dim.dimHeight != null ? dim.dimHeight.toFixed(9) : null,
          dimPieces: dim.dimPieces != null ? dim.dimPieces.toFixed(3) : null,
          components: explosion.isKit
            ? explosion.moves.map((m) =>
                Object.assign(new SaleLineComponent(), {
                  componentItemId: m.itemId,
                  stockQuantity: m.quantity.toFixed(3),
                }),
              )
            : undefined,
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

      for (const { explosion } of resolvedLines) {
        for (const move of explosion.moves) {
          const previousQuantity = await this.stockService.getQuantity(
            dto.locationId,
            move.itemId,
            manager,
          );
          await this.stockService.adjust(
            {
              locationId: dto.locationId,
              itemId: move.itemId,
              quantityDelta: -move.quantity,
            },
            manager,
          );
          stockChanges.push({
            locationId: dto.locationId,
            itemId: move.itemId,
            previousQuantity,
          });
        }
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
            source: CreditSource.SALE,
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
