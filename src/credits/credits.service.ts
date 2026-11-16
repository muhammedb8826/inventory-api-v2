import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  ObjectLiteral,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import {
  BankTransactionType,
  CreditSource,
  CreditStatus,
} from '../common/enums';
import {
  applyDateRangeToQb,
  applyRelatedIlikeSearch,
  paginatedQueryBuilder,
  sumFilteredQueryBuilder,
} from '../common/utils/query.util';
import { CreditListQueryDto } from './dto/credit-list-query.dto';
import { BankLedgerService } from '../banks/bank-ledger.service';
import { BankTransaction } from '../database/entities/bank-transaction.entity';
import { CustomerCredit } from '../database/entities/customer-credit.entity';
import { SupplierCredit } from '../database/entities/supplier-credit.entity';
import { Customer } from '../database/entities/customer.entity';
import { Supplier } from '../database/entities/supplier.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { CreditPaymentDto } from './dto/credit-payment.dto';
import {
  CreateOpeningCustomerCreditDto,
  CreateOpeningSupplierCreditDto,
} from './dto/opening-credit.dto';

export type CreditListTotals = {
  amount: string;
  paidAmount: string;
  balance: string;
};

export type CreditPaymentRow = {
  id: string;
  sequence: number;
  amount: string;
  bankAccountId: string;
  bankAccountName: string | null;
  description: string | null;
  notes: string | null;
  status: 'POSTED' | 'VOIDED';
  createdAt: Date;
  createdById: string | null;
};

@Injectable()
export class CreditsService {
  constructor(
    @InjectRepository(CustomerCredit)
    private readonly customerCreditRepo: Repository<CustomerCredit>,
    @InjectRepository(SupplierCredit)
    private readonly supplierCreditRepo: Repository<SupplierCredit>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Supplier)
    private readonly supplierRepo: Repository<Supplier>,
    @InjectRepository(BankTransaction)
    private readonly bankTxRepo: Repository<BankTransaction>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly bankLedger: BankLedgerService,
    private readonly notifications: NotificationsService,
  ) {}

  async findCustomerCredits(query: CreditListQueryDto) {
    const filteredQb = this.buildCustomerCreditsQb(query);
    const [totals, page] = await Promise.all([
      this.computeTotals(filteredQb),
      paginatedQueryBuilder(
        filteredQb
          .clone()
          .leftJoinAndSelect('credit.customer', 'customer')
          .leftJoinAndSelect('credit.sale', 'sale')
          .orderBy('credit.created_at', 'DESC'),
        query.page,
        query.limit,
      ),
    ]);

    return { ...page, totals };
  }

  async findSupplierCredits(query: CreditListQueryDto) {
    const filteredQb = this.buildSupplierCreditsQb(query);
    const [totals, page] = await Promise.all([
      this.computeTotals(filteredQb),
      paginatedQueryBuilder(
        filteredQb
          .clone()
          .leftJoinAndSelect('credit.supplier', 'supplier')
          .leftJoinAndSelect('credit.purchase', 'purchase')
          .orderBy('credit.created_at', 'DESC'),
        query.page,
        query.limit,
      ),
    ]);

    return { ...page, totals };
  }

  private buildCustomerCreditsQb(query: CreditListQueryDto) {
    const qb = this.customerCreditRepo.createQueryBuilder('credit');

    if (query.status) {
      qb.andWhere('credit.status = :status', { status: query.status });
    }
    if (query.customerId) {
      qb.andWhere('credit.customer_id = :customerId', {
        customerId: query.customerId,
      });
    }
    if (query.source) {
      qb.andWhere('credit.source = :source', { source: query.source });
    }
    applyRelatedIlikeSearch(qb, query.search, ['credit.reference'], {
      table: 'customers',
      alias: 'customer_filter',
      parentKey: 'credit.customer_id',
      relatedKey: 'id',
      columns: ['name', 'phone'],
    });
    applyDateRangeToQb(qb, 'credit.created_at', query.from, query.to);

    return qb;
  }

  private buildSupplierCreditsQb(query: CreditListQueryDto) {
    const qb = this.supplierCreditRepo.createQueryBuilder('credit');

    if (query.status) {
      qb.andWhere('credit.status = :status', { status: query.status });
    }
    if (query.supplierId) {
      qb.andWhere('credit.supplier_id = :supplierId', {
        supplierId: query.supplierId,
      });
    }
    if (query.source) {
      qb.andWhere('credit.source = :source', { source: query.source });
    }
    applyRelatedIlikeSearch(qb, query.search, ['credit.reference'], {
      table: 'suppliers',
      alias: 'supplier_filter',
      parentKey: 'credit.supplier_id',
      relatedKey: 'id',
      columns: ['name', 'phone'],
    });
    applyDateRangeToQb(qb, 'credit.created_at', query.from, query.to);

    return qb;
  }

  private async computeTotals(
    filteredQb: SelectQueryBuilder<ObjectLiteral>,
  ): Promise<CreditListTotals> {
    const raw = await sumFilteredQueryBuilder(filteredQb, [
      {
        key: 'totalAmount',
        sql: 'COALESCE(SUM(credit.amount::numeric), 0)',
      },
      {
        key: 'totalPaidAmount',
        sql: 'COALESCE(SUM(credit.paid_amount::numeric), 0)',
      },
      {
        key: 'totalBalance',
        sql: 'COALESCE(SUM(credit.balance::numeric), 0)',
      },
    ]);

    return {
      amount: raw.totalAmount,
      paidAmount: raw.totalPaidAmount,
      balance: raw.totalBalance,
    };
  }

  async findCustomerCredit(id: string) {
    const credit = await this.customerCreditRepo.findOne({
      where: { id },
      relations: { customer: true, sale: true },
    });
    if (!credit) throw new NotFoundException('Customer credit not found');
    return credit;
  }

  async findSupplierCredit(id: string) {
    const credit = await this.supplierCreditRepo.findOne({
      where: { id },
      relations: { supplier: true, purchase: true },
    });
    if (!credit) throw new NotFoundException('Supplier credit not found');
    return credit;
  }

  async listCustomerPayments(id: string) {
    await this.findCustomerCredit(id);
    return this.listPaymentsForCredit('customer_credit_payment', id);
  }

  async listSupplierPayments(id: string) {
    await this.findSupplierCredit(id);
    return this.listPaymentsForCredit('supplier_credit_payment', id);
  }

  async payCustomerCredit(id: string, dto: CreditPaymentDto, userId?: string) {
    return this.dataSource.transaction(async (manager) => {
      const creditRepo = manager.getRepository(CustomerCredit);
      const txRepo = manager.getRepository(BankTransaction);
      const credit = await creditRepo.findOne({
        where: { id },
        relations: { customer: true },
      });
      if (!credit) throw new NotFoundException('Customer credit not found');

      const balance = parseFloat(credit.balance);
      if (dto.amount > balance) {
        throw new BadRequestException('Payment exceeds balance');
      }

      const party = credit.customer?.name ?? 'customer';
      const sourceLabel =
        credit.source === CreditSource.OPENING
          ? 'opening receivable'
          : 'receivable';
      const term = await this.nextPaymentSequence(
        txRepo,
        'customer_credit_payment',
        id,
      );
      const note = dto.notes?.trim();
      const description = [
        `${sourceLabel} payment #${term} — ${party}`,
        note || null,
      ]
        .filter(Boolean)
        .join(' · ');

      // Money in: customer settles AR (including opening cutover balances).
      const payment = await this.bankLedger.recordTransaction(
        {
          bankAccountId: dto.bankAccountId,
          type: BankTransactionType.CREDIT_RECEIPT,
          amount: dto.amount,
          direction: 'in',
          description,
          refType: 'customer_credit_payment',
          refId: id,
          createdById: userId,
        },
        manager,
      );

      const paid = parseFloat(credit.paidAmount) + dto.amount;
      const newBalance = parseFloat(credit.amount) - paid;
      credit.paidAmount = paid.toFixed(2);
      credit.balance = Math.max(0, newBalance).toFixed(2);
      credit.status =
        newBalance <= 0
          ? CreditStatus.PAID
          : paid > 0
            ? CreditStatus.PARTIAL
            : CreditStatus.OPEN;

      const saved = await creditRepo.save(credit);
      return { credit: saved, payment };
    });
  }

  async paySupplierCredit(id: string, dto: CreditPaymentDto, userId?: string) {
    return this.dataSource.transaction(async (manager) => {
      const creditRepo = manager.getRepository(SupplierCredit);
      const txRepo = manager.getRepository(BankTransaction);
      const credit = await creditRepo.findOne({
        where: { id },
        relations: { supplier: true },
      });
      if (!credit) throw new NotFoundException('Supplier credit not found');

      const balance = parseFloat(credit.balance);
      if (dto.amount > balance) {
        throw new BadRequestException('Payment exceeds balance');
      }

      const party = credit.supplier?.name ?? 'supplier';
      const sourceLabel =
        credit.source === CreditSource.OPENING ? 'opening payable' : 'payable';
      const term = await this.nextPaymentSequence(
        txRepo,
        'supplier_credit_payment',
        id,
      );
      const note = dto.notes?.trim();
      const description = [
        `${sourceLabel} payment #${term} — ${party}`,
        note || null,
      ]
        .filter(Boolean)
        .join(' · ');

      // Money out: we settle AP (including opening cutover balances).
      const payment = await this.bankLedger.recordTransaction(
        {
          bankAccountId: dto.bankAccountId,
          type: BankTransactionType.CREDIT_PAYMENT,
          amount: dto.amount,
          direction: 'out',
          description,
          refType: 'supplier_credit_payment',
          refId: id,
          createdById: userId,
        },
        manager,
      );

      const paid = parseFloat(credit.paidAmount) + dto.amount;
      const newBalance = parseFloat(credit.amount) - paid;
      credit.paidAmount = paid.toFixed(2);
      credit.balance = Math.max(0, newBalance).toFixed(2);
      credit.status =
        newBalance <= 0
          ? CreditStatus.PAID
          : paid > 0
            ? CreditStatus.PARTIAL
            : CreditStatus.OPEN;

      const saved = await creditRepo.save(credit);
      return { credit: saved, payment };
    });
  }

  async voidCustomerPayment(id: string, paymentId: string, userId?: string) {
    return this.voidOnePayment(
      'customer',
      id,
      paymentId,
      'customer_credit_payment',
      userId,
    );
  }

  async voidSupplierPayment(id: string, paymentId: string, userId?: string) {
    return this.voidOnePayment(
      'supplier',
      id,
      paymentId,
      'supplier_credit_payment',
      userId,
    );
  }

  async createOpeningCustomerCredit(dto: CreateOpeningCustomerCreditDto) {
    const customer = await this.customerRepo.findOne({
      where: { id: dto.customerId },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    if (!customer.isActive) {
      throw new BadRequestException('Customer is inactive');
    }

    const amount = dto.amount.toFixed(2);
    const saved = await this.customerCreditRepo.save(
      this.customerCreditRepo.create({
        customerId: dto.customerId,
        saleId: null,
        source: CreditSource.OPENING,
        reference: dto.reference?.trim() || null,
        notes: dto.notes?.trim() || null,
        amount,
        paidAmount: '0.00',
        balance: amount,
        status: CreditStatus.OPEN,
        dueDate: dto.dueDate ?? null,
      }),
    );

    const credit = await this.customerCreditRepo.findOne({
      where: { id: saved.id },
      relations: { customer: true, sale: true },
    });
    await this.notifications.onOpeningCredit({
      kind: 'customer',
      creditId: saved.id,
      partyName: customer.name,
      amount,
      dueDate: dto.dueDate ?? null,
      reference: dto.reference?.trim() || null,
    });
    return credit;
  }

  async createOpeningSupplierCredit(dto: CreateOpeningSupplierCreditDto) {
    const supplier = await this.supplierRepo.findOne({
      where: { id: dto.supplierId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    if (!supplier.isActive) {
      throw new BadRequestException('Supplier is inactive');
    }

    const amount = dto.amount.toFixed(2);
    const saved = await this.supplierCreditRepo.save(
      this.supplierCreditRepo.create({
        supplierId: dto.supplierId,
        purchaseId: null,
        source: CreditSource.OPENING,
        reference: dto.reference?.trim() || null,
        notes: dto.notes?.trim() || null,
        amount,
        paidAmount: '0.00',
        balance: amount,
        status: CreditStatus.OPEN,
        dueDate: dto.dueDate ?? null,
      }),
    );

    const credit = await this.supplierCreditRepo.findOne({
      where: { id: saved.id },
      relations: { supplier: true, purchase: true },
    });
    await this.notifications.onOpeningCredit({
      kind: 'supplier',
      creditId: saved.id,
      partyName: supplier.name,
      amount,
      dueDate: dto.dueDate ?? null,
      reference: dto.reference?.trim() || null,
    });
    return credit;
  }

  async voidCustomerCreditPayments(id: string, userId?: string) {
    return this.dataSource.transaction(async (manager) => {
      const creditRepo = manager.getRepository(CustomerCredit);
      const credit = await creditRepo.findOne({
        where: { id },
        relations: { customer: true },
      });
      if (!credit) throw new NotFoundException('Customer credit not found');

      const paid = parseFloat(credit.paidAmount);
      if (paid <= 0) {
        throw new BadRequestException('No payments to void on this credit');
      }

      const party = credit.customer?.name ?? 'customer';
      await this.bankLedger.reverseAllByReference(
        'customer_credit_payment',
        id,
        `Void receivable payments — ${party}`,
        userId,
        manager,
      );

      credit.paidAmount = '0.00';
      credit.balance = parseFloat(credit.amount).toFixed(2);
      credit.status = CreditStatus.OPEN;
      return creditRepo.save(credit);
    });
  }

  async voidSupplierCreditPayments(id: string, userId?: string) {
    return this.dataSource.transaction(async (manager) => {
      const creditRepo = manager.getRepository(SupplierCredit);
      const credit = await creditRepo.findOne({
        where: { id },
        relations: { supplier: true },
      });
      if (!credit) throw new NotFoundException('Supplier credit not found');

      const paid = parseFloat(credit.paidAmount);
      if (paid <= 0) {
        throw new BadRequestException('No payments to void on this credit');
      }

      const party = credit.supplier?.name ?? 'supplier';
      await this.bankLedger.reverseAllByReference(
        'supplier_credit_payment',
        id,
        `Void payable payments — ${party}`,
        userId,
        manager,
      );

      credit.paidAmount = '0.00';
      credit.balance = parseFloat(credit.amount).toFixed(2);
      credit.status = CreditStatus.OPEN;
      return creditRepo.save(credit);
    });
  }

  async removeOpeningCustomerCredit(id: string) {
    const credit = await this.customerCreditRepo.findOne({ where: { id } });
    if (!credit) throw new NotFoundException('Customer credit not found');
    this.assertOpeningRemovable(credit.source, credit.paidAmount);
    await this.customerCreditRepo.remove(credit);
    return { success: true };
  }

  async removeOpeningSupplierCredit(id: string) {
    const credit = await this.supplierCreditRepo.findOne({ where: { id } });
    if (!credit) throw new NotFoundException('Supplier credit not found');
    this.assertOpeningRemovable(credit.source, credit.paidAmount);
    await this.supplierCreditRepo.remove(credit);
    return { success: true };
  }

  private assertOpeningRemovable(source: CreditSource, paidAmount: string) {
    if (source !== CreditSource.OPENING) {
      throw new BadRequestException(
        'Only opening credits can be deleted; void the sale or purchase instead',
      );
    }
    if (parseFloat(paidAmount) > 0) {
      throw new BadRequestException(
        'Cannot delete an opening credit after payments have been applied; void payments first',
      );
    }
  }

  private async nextPaymentSequence(
    txRepo: Repository<BankTransaction>,
    refType: string,
    creditId: string,
  ) {
    const count = await txRepo.count({
      where: { refType, refId: creditId },
    });
    return count + 1;
  }

  private async listPaymentsForCredit(
    refType: string,
    creditId: string,
  ): Promise<{
    data: CreditPaymentRow[];
    totals: { paid: string; voided: string };
  }> {
    const rows = await this.bankTxRepo.find({
      where: { refType, refId: creditId },
      relations: { bankAccount: true },
      order: { createdAt: 'ASC' },
    });

    const reversalIds = new Set(
      (
        await this.bankTxRepo
          .createQueryBuilder('r')
          .select('r.reference_id', 'refId')
          .where('r.reference_type = :rt', { rt: `${refType}_reversal` })
          .andWhere('r.reference_id IN (:...ids)', {
            ids: rows.length
              ? rows.map((r) => r.id)
              : ['00000000-0000-0000-0000-000000000000'],
          })
          .getRawMany<{ refId: string }>()
      ).map((r) => r.refId),
    );

    let paid = 0;
    let voided = 0;
    const data: CreditPaymentRow[] = rows.map((row, index) => {
      const amount = parseFloat(row.amount);
      const isVoided = reversalIds.has(row.id);
      if (isVoided) voided += amount;
      else paid += amount;

      const description = row.description ?? null;
      const notes = this.extractPaymentNotes(description);

      return {
        id: row.id,
        sequence: index + 1,
        amount: amount.toFixed(2),
        bankAccountId: row.bankAccountId,
        bankAccountName: row.bankAccount?.name ?? null,
        description,
        notes,
        status: isVoided ? 'VOIDED' : 'POSTED',
        createdAt: row.createdAt,
        createdById: row.createdById,
      };
    });

    return {
      data,
      totals: {
        paid: paid.toFixed(2),
        voided: voided.toFixed(2),
      },
    };
  }

  private extractPaymentNotes(description: string | null): string | null {
    if (!description) return null;
    const parts = description.split(' · ');
    if (parts.length < 2) return null;
    return parts.slice(1).join(' · ').trim() || null;
  }

  private async voidOnePayment(
    kind: 'customer' | 'supplier',
    creditId: string,
    paymentId: string,
    refType: string,
    userId?: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const txRepo = manager.getRepository(BankTransaction);

      const payment = await txRepo.findOne({ where: { id: paymentId } });
      if (
        !payment ||
        payment.refType !== refType ||
        payment.refId !== creditId
      ) {
        throw new NotFoundException('Payment not found for this credit');
      }

      const already = await txRepo.findOne({
        where: {
          refType: `${refType}_reversal`,
          refId: payment.id,
        },
      });
      if (already) {
        throw new BadRequestException('Payment is already voided');
      }

      if (kind === 'customer') {
        const creditRepo = manager.getRepository(CustomerCredit);
        const credit = await creditRepo.findOne({
          where: { id: creditId },
          relations: { customer: true },
        });
        if (!credit) throw new NotFoundException('Customer credit not found');

        const party = credit.customer?.name ?? 'customer';
        await this.bankLedger.reverseById(
          payment.id,
          `Void receivable payment — ${party}`,
          userId,
          manager,
        );
        this.applyPaymentVoidToCredit(credit, payment.amount);
        return creditRepo.save(credit);
      }

      const creditRepo = manager.getRepository(SupplierCredit);
      const credit = await creditRepo.findOne({
        where: { id: creditId },
        relations: { supplier: true },
      });
      if (!credit) throw new NotFoundException('Supplier credit not found');

      const party = credit.supplier?.name ?? 'supplier';
      await this.bankLedger.reverseById(
        payment.id,
        `Void payable payment — ${party}`,
        userId,
        manager,
      );
      this.applyPaymentVoidToCredit(credit, payment.amount);
      return creditRepo.save(credit);
    });
  }

  private applyPaymentVoidToCredit(
    credit: CustomerCredit | SupplierCredit,
    paymentAmount: string,
  ) {
    const amount = parseFloat(paymentAmount);
    const paid = Math.max(0, parseFloat(credit.paidAmount) - amount);
    const newBalance = parseFloat(credit.amount) - paid;
    credit.paidAmount = paid.toFixed(2);
    credit.balance = Math.max(0, newBalance).toFixed(2);
    credit.status =
      paid <= 0
        ? CreditStatus.OPEN
        : newBalance <= 0
          ? CreditStatus.PAID
          : CreditStatus.PARTIAL;
  }
}
