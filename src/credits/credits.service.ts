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
import { BankTransactionType, CreditSource, CreditStatus } from '../common/enums';
import {
  applyDateRangeToQb,
  applyRelatedIlikeSearch,
  paginatedQueryBuilder,
  sumFilteredQueryBuilder,
} from '../common/utils/query.util';
import { CreditListQueryDto } from './dto/credit-list-query.dto';
import { BankLedgerService } from '../banks/bank-ledger.service';
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

  async payCustomerCredit(id: string, dto: CreditPaymentDto, userId?: string) {
    if (!dto.bankAccountId) {
      throw new BadRequestException('bankAccountId required');
    }

    return this.dataSource.transaction(async (manager) => {
      const creditRepo = manager.getRepository(CustomerCredit);
      const credit = await creditRepo.findOne({ where: { id } });
      if (!credit) throw new NotFoundException('Customer credit not found');

      const balance = parseFloat(credit.balance);
      if (dto.amount > balance) {
        throw new BadRequestException('Payment exceeds balance');
      }

      await this.bankLedger.recordTransaction(
        {
          bankAccountId: dto.bankAccountId!,
          type: BankTransactionType.CREDIT_RECEIPT,
          amount: dto.amount,
          direction: 'in',
          description: `Customer credit payment ${id}`,
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

      return creditRepo.save(credit);
    });
  }

  async paySupplierCredit(id: string, dto: CreditPaymentDto, userId?: string) {
    if (!dto.bankAccountId) {
      throw new BadRequestException('bankAccountId required');
    }

    return this.dataSource.transaction(async (manager) => {
      const creditRepo = manager.getRepository(SupplierCredit);
      const credit = await creditRepo.findOne({ where: { id } });
      if (!credit) throw new NotFoundException('Supplier credit not found');

      const balance = parseFloat(credit.balance);
      if (dto.amount > balance) {
        throw new BadRequestException('Payment exceeds balance');
      }

      await this.bankLedger.recordTransaction(
        {
          bankAccountId: dto.bankAccountId!,
          type: BankTransactionType.CREDIT_PAYMENT,
          amount: dto.amount,
          direction: 'out',
          description: `Supplier credit payment ${id}`,
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

      return creditRepo.save(credit);
    });
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
        'Cannot delete an opening credit after payments have been applied',
      );
    }
  }
}
