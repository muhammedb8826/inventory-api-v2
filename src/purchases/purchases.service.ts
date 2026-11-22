import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  BankTransactionType,
  CreditSource,
  CreditStatus,
  DocumentStatus,
  PaymentMethod,
} from '../common/enums';
import {
  applyDateRangeToQb,
  applyRelatedIlikeSearch,
  paginatedQueryBuilder,
  sumFilteredQueryBuilder,
} from '../common/utils/query.util';
import { PurchaseListQueryDto } from './dto/purchase-list-query.dto';
import { BankLedgerService } from '../banks/bank-ledger.service';
import { BanksService } from '../banks/banks.service';
import { PurchaseLine } from '../database/entities/purchase-line.entity';
import { Purchase } from '../database/entities/purchase.entity';
import { SupplierCredit } from '../database/entities/supplier-credit.entity';
import { StockService } from '../inventory/stock.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreatePurchaseDto, PurchaseLineDto } from './dto/purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { UomConversionService } from '../uom/uom-conversion.service';
import { resolveDimensionalLine } from '../uom/resolve-dimensional-line';
import { loadItemForUom } from '../uom/resolve-line-uom';

function stockQtyOf(line: {
  quantity: string | number;
  stockQuantity?: string | null;
}): number {
  if (line.stockQuantity != null && line.stockQuantity !== '') {
    return parseFloat(String(line.stockQuantity));
  }
  return typeof line.quantity === 'number'
    ? line.quantity
    : parseFloat(line.quantity);
}

@Injectable()
export class PurchasesService {
  constructor(
    @InjectRepository(Purchase)
    private readonly purchaseRepo: Repository<Purchase>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly stockService: StockService,
    private readonly bankLedger: BankLedgerService,
    private readonly banksService: BanksService,
    private readonly notifications: NotificationsService,
    private readonly uomConversion: UomConversionService,
  ) {}

  async findAll(query: PurchaseListQueryDto) {
    const filteredQb = this.buildPurchaseFilterQb(query);
    const [totals, page] = await Promise.all([
      sumFilteredQueryBuilder(filteredQb, [
        {
          key: 'subtotal',
          sql: 'COALESCE(SUM(purchase.subtotal::numeric), 0)',
        },
        { key: 'total', sql: 'COALESCE(SUM(purchase.total::numeric), 0)' },
      ]),
      paginatedQueryBuilder(
        filteredQb
          .clone()
          .leftJoinAndSelect('purchase.supplier', 'supplier')
          .leftJoinAndSelect('purchase.location', 'location')
          .leftJoinAndSelect('purchase.lines', 'lines')
          .leftJoinAndSelect('lines.item', 'item')
          .leftJoinAndSelect('purchase.credit', 'credit')
          .orderBy('purchase.created_at', 'DESC'),
        query.page,
        query.limit,
      ),
    ]);

    return { ...page, totals };
  }

  private buildPurchaseFilterQb(query: PurchaseListQueryDto) {
    const includeVoided = query.includeVoided === 'true';
    const qb = this.purchaseRepo.createQueryBuilder('purchase');

    if (!includeVoided) {
      qb.andWhere('purchase.status = :status', {
        status: DocumentStatus.ACTIVE,
      });
    }
    if (query.supplierId) {
      qb.andWhere('purchase.supplier_id = :supplierId', {
        supplierId: query.supplierId,
      });
    }
    if (query.locationId) {
      qb.andWhere('purchase.location_id = :locationId', {
        locationId: query.locationId,
      });
    }
    if (query.paymentMethod) {
      qb.andWhere('purchase.paymentMethod = :paymentMethod', {
        paymentMethod: query.paymentMethod,
      });
    }
    applyRelatedIlikeSearch(qb, query.search, ['purchase.notes'], {
      table: 'suppliers',
      alias: 'supplier_filter',
      parentKey: 'purchase.supplier_id',
      relatedKey: 'id',
      columns: ['name', 'phone'],
    });
    applyDateRangeToQb(qb, 'purchase.created_at', query.from, query.to);

    return qb;
  }

  async findOne(id: string) {
    const purchase = await this.purchaseRepo.findOne({
      where: { id },
      relations: {
        supplier: true,
        location: true,
        lines: {
          item: { stockUom: true },
          uom: true,
        },
        credit: true,
      },
    });
    if (!purchase) throw new NotFoundException('Purchase not found');
    return purchase;
  }

  private isNotesOnlyUpdate(dto: UpdatePurchaseDto): boolean {
    const keys = (Object.keys(dto) as (keyof UpdatePurchaseDto)[]).filter(
      (k) => dto[k] !== undefined,
    );
    return keys.length === 1 && keys[0] === 'notes';
  }

  private resolveLines(
    purchase: Purchase,
    dto: UpdatePurchaseDto,
  ): PurchaseLineDto[] {
    if (dto.lines) return dto.lines;
    return purchase.lines.map((l) => ({
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

  async update(id: string, dto: UpdatePurchaseDto, userId?: string) {
    if (this.isNotesOnlyUpdate(dto)) {
      const purchase = await this.findOne(id);
      if (purchase.status === DocumentStatus.VOIDED) {
        throw new BadRequestException('Cannot update a voided purchase');
      }
      purchase.notes = dto.notes ?? null;
      await this.purchaseRepo.save(purchase);
      return this.findOne(id);
    }

    const hasFields = (Object.keys(dto) as (keyof UpdatePurchaseDto)[]).some(
      (k) => dto[k] !== undefined,
    );
    if (!hasFields) return this.findOne(id);

    await this.dataSource.transaction(async (manager) => {
      const purchaseRepo = manager.getRepository(Purchase);
      const lineRepo = manager.getRepository(PurchaseLine);
      const creditRepo = manager.getRepository(SupplierCredit);

      const purchase = await purchaseRepo.findOne({
        where: { id },
        relations: { lines: true, credit: true },
      });
      if (!purchase) throw new NotFoundException('Purchase not found');
      if (purchase.status === DocumentStatus.VOIDED) {
        throw new BadRequestException('Cannot update a voided purchase');
      }

      if (purchase.credit) {
        const paid = parseFloat(purchase.credit.paidAmount);
        if (paid > 0) {
          throw new BadRequestException(
            'Cannot change purchase after supplier credit payments; only notes may be updated',
          );
        }
      }

      const supplierId = dto.supplierId ?? purchase.supplierId;
      const locationId = dto.locationId ?? purchase.locationId;
      const paymentMethod = dto.paymentMethod ?? purchase.paymentMethod;
      const bankAccountId =
        dto.bankAccountId !== undefined
          ? dto.bankAccountId
          : purchase.bankAccountId;
      const notes =
        dto.notes !== undefined ? (dto.notes ?? null) : purchase.notes;
      const creditDueDate =
        dto.creditDueDate !== undefined
          ? dto.creditDueDate
          : (purchase.credit?.dueDate ?? undefined);
      const lines = this.resolveLines(purchase, dto);

      if (this.paysViaBank(paymentMethod) && !bankAccountId) {
        throw new BadRequestException(
          'bankAccountId required for BANK and CASH payments',
        );
      }
      if (this.paysViaBank(paymentMethod) && bankAccountId) {
        await this.banksService.assertPaymentAccount(
          paymentMethod,
          bankAccountId,
          manager,
        );
      }

      const oldLocationId = purchase.locationId;
      const oldPaymentMethod = purchase.paymentMethod;
      const oldBankAccountId = purchase.bankAccountId;

      for (const line of purchase.lines) {
        await this.stockService.adjust(
          {
            locationId: oldLocationId,
            itemId: line.itemId,
            quantityDelta: -stockQtyOf(line),
          },
          manager,
        );
      }

      if (this.paysViaBank(oldPaymentMethod) && oldBankAccountId) {
        await this.bankLedger.reverseByReference(
          'purchase',
          purchase.id,
          `Adjust purchase ${purchase.id}`,
          userId,
          manager,
        );
      }

      if (purchase.credit) {
        await creditRepo.remove(purchase.credit);
      }

      await lineRepo.delete({ purchaseId: purchase.id });

      const resolved: {
        line: PurchaseLineDto;
        dim: Awaited<ReturnType<typeof resolveDimensionalLine>>;
      }[] = [];
      for (const l of lines) {
        const item = await loadItemForUom(manager, l.itemId);
        if (!item) {
          throw new BadRequestException(`Item not found: ${l.itemId}`);
        }
        const dim = await resolveDimensionalLine(
          this.uomConversion,
          item,
          'purchase',
          l.quantity ?? l.pieces ?? 1,
          l.unitPrice,
          l.uomId,
          {
            width: l.width,
            height: l.height,
            pieces: l.pieces,
            dimUomId: l.uomId,
          },
        );
        resolved.push({ line: l, dim });
      }

      const subtotal = resolved.reduce((sum, r) => sum + r.dim.lineTotal, 0);

      purchase.supplierId = supplierId;
      purchase.locationId = locationId;
      purchase.paymentMethod = paymentMethod;
      purchase.bankAccountId = bankAccountId ?? null;
      purchase.subtotal = subtotal.toFixed(2);
      purchase.total = subtotal.toFixed(2);
      purchase.notes = notes;
      purchase.lines = resolved.map(({ line: l, dim }) =>
        Object.assign(new PurchaseLine(), {
          itemId: l.itemId,
          quantity: dim.quantity.toFixed(3),
          uomId: dim.uomId,
          stockQuantity: dim.stockQuantity.toFixed(3),
          unitPrice: l.unitPrice.toFixed(2),
          lineTotal: dim.lineTotal.toFixed(2),
          dimWidth: dim.dimWidth != null ? dim.dimWidth.toFixed(9) : null,
          dimHeight: dim.dimHeight != null ? dim.dimHeight.toFixed(9) : null,
          dimPieces: dim.dimPieces != null ? dim.dimPieces.toFixed(3) : null,
        }),
      );

      await purchaseRepo.save(purchase);

      for (const { dim } of resolved) {
        const stockUnitCost =
          dim.stockQuantity > 0
            ? dim.lineTotal / dim.stockQuantity
            : dim.lineTotal;
        await this.stockService.adjust(
          {
            locationId,
            itemId: dim.itemId,
            quantityDelta: dim.stockQuantity,
            purchasePrice: stockUnitCost,
          },
          manager,
        );
      }

      if (this.paysViaBank(paymentMethod) && bankAccountId) {
        await this.bankLedger.recordTransaction(
          {
            bankAccountId,
            type: BankTransactionType.PURCHASE,
            amount: subtotal,
            direction: 'out',
            description: `Purchase ${purchase.id}`,
            refType: 'purchase',
            refId: purchase.id,
            createdById: userId,
          },
          manager,
        );
      }

      if (paymentMethod === PaymentMethod.CREDIT) {
        await creditRepo.save(
          creditRepo.create({
            supplierId,
            purchaseId: purchase.id,
            source: CreditSource.PURCHASE,
            amount: subtotal.toFixed(2),
            paidAmount: '0',
            balance: subtotal.toFixed(2),
            status: CreditStatus.OPEN,
            dueDate: creditDueDate ?? null,
          }),
        );
      }
    });

    return this.findOne(id);
  }

  async void(id: string, userId?: string) {
    await this.dataSource.transaction(async (manager) => {
      const purchaseRepo = manager.getRepository(Purchase);
      const creditRepo = manager.getRepository(SupplierCredit);

      const purchase = await purchaseRepo.findOne({
        where: { id },
        relations: { lines: true, credit: true },
      });
      if (!purchase) throw new NotFoundException('Purchase not found');
      if (purchase.status === DocumentStatus.VOIDED) {
        throw new BadRequestException('Purchase already voided');
      }

      if (purchase.credit) {
        const paid = parseFloat(purchase.credit.paidAmount);
        if (paid > 0) {
          throw new BadRequestException(
            'Cannot void purchase with supplier credit payments applied',
          );
        }
        await creditRepo.remove(purchase.credit);
      }

      for (const line of purchase.lines) {
        await this.stockService.adjust(
          {
            locationId: purchase.locationId,
            itemId: line.itemId,
            quantityDelta: -stockQtyOf(line),
          },
          manager,
        );
      }

      const needsBank =
        purchase.paymentMethod === PaymentMethod.BANK ||
        purchase.paymentMethod === PaymentMethod.CASH;
      if (needsBank && purchase.bankAccountId) {
        await this.bankLedger.reverseByReference(
          'purchase',
          purchase.id,
          `Void purchase ${purchase.id}`,
          userId,
          manager,
        );
      }

      purchase.status = DocumentStatus.VOIDED;
      purchase.voidedAt = new Date();
      await purchaseRepo.save(purchase);
    });

    return this.findOne(id);
  }

  async create(dto: CreatePurchaseDto, userId?: string) {
    const needsBank =
      dto.paymentMethod === PaymentMethod.BANK ||
      dto.paymentMethod === PaymentMethod.CASH;
    if (needsBank && !dto.bankAccountId) {
      throw new BadRequestException(
        'bankAccountId required for BANK and CASH payments',
      );
    }

    const created = await this.dataSource.transaction(async (manager) => {
      if (needsBank && dto.bankAccountId) {
        await this.banksService.assertPaymentAccount(
          dto.paymentMethod,
          dto.bankAccountId,
          manager,
        );
      }

      const purchaseRepo = manager.getRepository(Purchase);
      const creditRepo = manager.getRepository(SupplierCredit);

      const resolved: {
        line: PurchaseLineDto;
        dim: Awaited<ReturnType<typeof resolveDimensionalLine>>;
      }[] = [];
      for (const l of dto.lines) {
        const item = await loadItemForUom(manager, l.itemId);
        if (!item) {
          throw new BadRequestException(`Item not found: ${l.itemId}`);
        }
        const dim = await resolveDimensionalLine(
          this.uomConversion,
          item,
          'purchase',
          l.quantity ?? l.pieces ?? 1,
          l.unitPrice,
          l.uomId,
          {
            width: l.width,
            height: l.height,
            pieces: l.pieces,
            dimUomId: l.uomId,
          },
        );
        resolved.push({ line: l, dim });
      }

      const subtotal = resolved.reduce((sum, r) => sum + r.dim.lineTotal, 0);

      const lines = resolved.map(({ line: l, dim }) =>
        Object.assign(new PurchaseLine(), {
          itemId: l.itemId,
          quantity: dim.quantity.toFixed(3),
          uomId: dim.uomId,
          stockQuantity: dim.stockQuantity.toFixed(3),
          unitPrice: l.unitPrice.toFixed(2),
          lineTotal: dim.lineTotal.toFixed(2),
          dimWidth: dim.dimWidth != null ? dim.dimWidth.toFixed(9) : null,
          dimHeight: dim.dimHeight != null ? dim.dimHeight.toFixed(9) : null,
          dimPieces: dim.dimPieces != null ? dim.dimPieces.toFixed(3) : null,
        }),
      );

      const purchase = await purchaseRepo.save(
        purchaseRepo.create({
          supplierId: dto.supplierId,
          locationId: dto.locationId,
          paymentMethod: dto.paymentMethod,
          bankAccountId: dto.bankAccountId ?? null,
          subtotal: subtotal.toFixed(2),
          total: subtotal.toFixed(2),
          notes: dto.notes ?? null,
          status: DocumentStatus.ACTIVE,
          createdById: userId ?? null,
          lines,
        }),
      );

      for (const { dim } of resolved) {
        const stockUnitCost =
          dim.stockQuantity > 0
            ? dim.lineTotal / dim.stockQuantity
            : dim.lineTotal;
        await this.stockService.adjust(
          {
            locationId: dto.locationId,
            itemId: dim.itemId,
            quantityDelta: dim.stockQuantity,
            purchasePrice: stockUnitCost,
          },
          manager,
        );
      }

      if (needsBank && dto.bankAccountId) {
        await this.bankLedger.recordTransaction(
          {
            bankAccountId: dto.bankAccountId,
            type: BankTransactionType.PURCHASE,
            amount: subtotal,
            direction: 'out',
            description: `Purchase ${purchase.id}`,
            refType: 'purchase',
            refId: purchase.id,
            createdById: userId,
          },
          manager,
        );
      }

      if (dto.paymentMethod === PaymentMethod.CREDIT) {
        await creditRepo.save(
          creditRepo.create({
            supplierId: dto.supplierId,
            purchaseId: purchase.id,
            source: CreditSource.PURCHASE,
            amount: subtotal.toFixed(2),
            paidAmount: '0',
            balance: subtotal.toFixed(2),
            status: CreditStatus.OPEN,
            dueDate: dto.creditDueDate ?? null,
          }),
        );
      }

      return { purchaseId: purchase.id, subtotal };
    });

    await this.notifications.onPurchaseRecorded({
      purchaseId: created.purchaseId,
      total: created.subtotal.toFixed(2),
      actorUserId: userId,
      creditDueDate: dto.creditDueDate ?? null,
    });

    return this.findOne(created.purchaseId);
  }
}
