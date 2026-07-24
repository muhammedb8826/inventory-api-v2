import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BankTransactionType,
  CreditStatus,
  DocumentStatus,
} from '../common/enums';
import { applyDateRangeToQb } from '../common/utils/query.util';
import { getAppCurrency } from '../common/utils/currency.util';
import { BankTransaction } from '../database/entities/bank-transaction.entity';
import { CustomerCredit } from '../database/entities/customer-credit.entity';
import { Expense } from '../database/entities/expense.entity';
import { PurchaseLine } from '../database/entities/purchase-line.entity';
import { Purchase } from '../database/entities/purchase.entity';
import { SaleLine } from '../database/entities/sale-line.entity';
import { Sale } from '../database/entities/sale.entity';
import { StockLevel } from '../database/entities/stock-level.entity';
import { SupplierCredit } from '../database/entities/supplier-credit.entity';
import { ReportQueryDto } from './report-query.dto';

@Injectable()
export class ReportsService {
  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Sale)
    private readonly saleRepo: Repository<Sale>,
    @InjectRepository(SaleLine)
    private readonly saleLineRepo: Repository<SaleLine>,
    @InjectRepository(Purchase)
    private readonly purchaseRepo: Repository<Purchase>,
    @InjectRepository(PurchaseLine)
    private readonly purchaseLineRepo: Repository<PurchaseLine>,
    @InjectRepository(Expense)
    private readonly expenseRepo: Repository<Expense>,
    @InjectRepository(BankTransaction)
    private readonly bankTransactionRepo: Repository<BankTransaction>,
    @InjectRepository(StockLevel)
    private readonly stockRepo: Repository<StockLevel>,
    @InjectRepository(CustomerCredit)
    private readonly customerCreditRepo: Repository<CustomerCredit>,
    @InjectRepository(SupplierCredit)
    private readonly supplierCreditRepo: Repository<SupplierCredit>,
  ) {}

  private currency() {
    return getAppCurrency(this.config);
  }

  private period(from?: string, to?: string) {
    return { from: from ?? null, to: to ?? null };
  }

  private saleBaseQb(query: ReportQueryDto) {
    const qb = this.saleRepo
      .createQueryBuilder('sale')
      .where('sale.status = :status', { status: DocumentStatus.ACTIVE });
    if (query.locationId) {
      qb.andWhere('sale.location_id = :locationId', {
        locationId: query.locationId,
      });
    }
    if (query.customerId) {
      qb.andWhere('sale.customer_id = :customerId', {
        customerId: query.customerId,
      });
    }
    if (query.soldByUserId) {
      qb.andWhere('sale.sold_by_user_id = :soldByUserId', {
        soldByUserId: query.soldByUserId,
      });
    }
    applyDateRangeToQb(qb, 'sale.created_at', query.from, query.to);
    return qb;
  }

  private purchaseBaseQb(query: ReportQueryDto) {
    const qb = this.purchaseRepo
      .createQueryBuilder('purchase')
      .where('purchase.status = :status', { status: DocumentStatus.ACTIVE });
    if (query.locationId) {
      qb.andWhere('purchase.location_id = :locationId', {
        locationId: query.locationId,
      });
    }
    if (query.supplierId) {
      qb.andWhere('purchase.supplier_id = :supplierId', {
        supplierId: query.supplierId,
      });
    }
    applyDateRangeToQb(qb, 'purchase.created_at', query.from, query.to);
    return qb;
  }

  private expenseBaseQb(query: ReportQueryDto) {
    const qb = this.expenseRepo.createQueryBuilder('expense');
    if (query.categoryId) {
      qb.andWhere('expense.category_id = :categoryId', {
        categoryId: query.categoryId,
      });
    }
    applyDateRangeToQb(qb, 'expense.expense_date', query.from, query.to);
    return qb;
  }

  async summary(query: ReportQueryDto) {
    const saleTotals = await this.saleBaseQb(query)
      .select('COALESCE(SUM(sale.total::numeric), 0)', 'total')
      .addSelect('COUNT(sale.id)', 'count')
      .getRawOne<{ total: string; count: string }>();

    const purchaseTotals = await this.purchaseBaseQb(query)
      .select('COALESCE(SUM(purchase.total::numeric), 0)', 'total')
      .addSelect('COUNT(purchase.id)', 'count')
      .getRawOne<{ total: string; count: string }>();

    const expenseTotals = await this.expenseBaseQb(query)
      .select('COALESCE(SUM(expense.amount::numeric), 0)', 'total')
      .addSelect('COUNT(expense.id)', 'count')
      .getRawOne<{ total: string; count: string }>();

    const totalRevenue = parseFloat(saleTotals?.total ?? '0');
    const totalPurchases = parseFloat(purchaseTotals?.total ?? '0');
    const totalExpenses = parseFloat(expenseTotals?.total ?? '0');
    const grossProfit = totalRevenue - totalPurchases;
    const netProfit = grossProfit - totalExpenses;

    return {
      currency: this.currency(),
      totalRevenue: totalRevenue.toFixed(2),
      totalPurchases: totalPurchases.toFixed(2),
      totalExpenses: totalExpenses.toFixed(2),
      grossProfit: grossProfit.toFixed(2),
      netProfit: netProfit.toFixed(2),
      marginPercent:
        totalRevenue > 0
          ? ((grossProfit / totalRevenue) * 100).toFixed(2)
          : '0.00',
      counts: {
        sales: parseInt(saleTotals?.count ?? '0', 10),
        purchases: parseInt(purchaseTotals?.count ?? '0', 10),
        expenses: parseInt(expenseTotals?.count ?? '0', 10),
      },
      period: this.period(query.from, query.to),
    };
  }

  async sales(query: ReportQueryDto) {
    const totals = await this.saleBaseQb(query)
      .select('COALESCE(SUM(sale.subtotal::numeric), 0)', 'subtotal')
      .addSelect('COALESCE(SUM(sale.total::numeric), 0)', 'total')
      .addSelect(
        'COALESCE(SUM(sale.commission_amount::numeric), 0)',
        'commission',
      )
      .addSelect('COUNT(sale.id)', 'count')
      .getRawOne<{
        subtotal: string;
        total: string;
        commission: string;
        count: string;
      }>();

    const byPaymentMethod = await this.saleBaseQb(query)
      .select('sale.paymentMethod', 'paymentMethod')
      .addSelect('COUNT(sale.id)', 'count')
      .addSelect('COALESCE(SUM(sale.total::numeric), 0)', 'total')
      .groupBy('sale.paymentMethod')
      .orderBy('total', 'DESC')
      .getRawMany<{ paymentMethod: string; count: string; total: string }>();

    const byLocation = await this.saleBaseQb(query)
      .leftJoin('sale.location', 'location')
      .select('sale.location_id', 'locationId')
      .addSelect('location.name', 'locationName')
      .addSelect('COUNT(sale.id)', 'count')
      .addSelect('COALESCE(SUM(sale.total::numeric), 0)', 'total')
      .groupBy('sale.location_id')
      .addGroupBy('location.name')
      .orderBy('total', 'DESC')
      .getRawMany<{
        locationId: string;
        locationName: string;
        count: string;
        total: string;
      }>();

    return {
      currency: this.currency(),
      period: this.period(query.from, query.to),
      totals: {
        count: parseInt(totals?.count ?? '0', 10),
        subtotal: parseFloat(totals?.subtotal ?? '0').toFixed(2),
        total: parseFloat(totals?.total ?? '0').toFixed(2),
        commission: parseFloat(totals?.commission ?? '0').toFixed(2),
      },
      byPaymentMethod: byPaymentMethod.map((row) => ({
        paymentMethod: row.paymentMethod,
        count: parseInt(row.count, 10),
        total: parseFloat(row.total).toFixed(2),
      })),
      byLocation: byLocation.map((row) => ({
        locationId: row.locationId,
        locationName: row.locationName,
        count: parseInt(row.count, 10),
        total: parseFloat(row.total).toFixed(2),
      })),
    };
  }

  async purchases(query: ReportQueryDto) {
    const totals = await this.purchaseBaseQb(query)
      .select('COALESCE(SUM(purchase.subtotal::numeric), 0)', 'subtotal')
      .addSelect('COALESCE(SUM(purchase.total::numeric), 0)', 'total')
      .addSelect('COUNT(purchase.id)', 'count')
      .getRawOne<{ subtotal: string; total: string; count: string }>();

    const byPaymentMethod = await this.purchaseBaseQb(query)
      .select('purchase.paymentMethod', 'paymentMethod')
      .addSelect('COUNT(purchase.id)', 'count')
      .addSelect('COALESCE(SUM(purchase.total::numeric), 0)', 'total')
      .groupBy('purchase.paymentMethod')
      .orderBy('total', 'DESC')
      .getRawMany<{ paymentMethod: string; count: string; total: string }>();

    const byLocation = await this.purchaseBaseQb(query)
      .leftJoin('purchase.location', 'location')
      .select('purchase.location_id', 'locationId')
      .addSelect('location.name', 'locationName')
      .addSelect('COUNT(purchase.id)', 'count')
      .addSelect('COALESCE(SUM(purchase.total::numeric), 0)', 'total')
      .groupBy('purchase.location_id')
      .addGroupBy('location.name')
      .orderBy('total', 'DESC')
      .getRawMany<{
        locationId: string;
        locationName: string;
        count: string;
        total: string;
      }>();

    return {
      currency: this.currency(),
      period: this.period(query.from, query.to),
      totals: {
        count: parseInt(totals?.count ?? '0', 10),
        subtotal: parseFloat(totals?.subtotal ?? '0').toFixed(2),
        total: parseFloat(totals?.total ?? '0').toFixed(2),
      },
      byPaymentMethod: byPaymentMethod.map((row) => ({
        paymentMethod: row.paymentMethod,
        count: parseInt(row.count, 10),
        total: parseFloat(row.total).toFixed(2),
      })),
      byLocation: byLocation.map((row) => ({
        locationId: row.locationId,
        locationName: row.locationName,
        count: parseInt(row.count, 10),
        total: parseFloat(row.total).toFixed(2),
      })),
    };
  }

  async expenses(query: ReportQueryDto) {
    const totals = await this.expenseBaseQb(query)
      .select('COALESCE(SUM(expense.amount::numeric), 0)', 'total')
      .addSelect('COUNT(expense.id)', 'count')
      .getRawOne<{ total: string; count: string }>();

    const byCategory = await this.expenseBaseQb(query)
      .leftJoin('expense.category', 'category')
      .select('expense.category_id', 'categoryId')
      .addSelect('category.name', 'categoryName')
      .addSelect('COUNT(expense.id)', 'count')
      .addSelect('COALESCE(SUM(expense.amount::numeric), 0)', 'total')
      .groupBy('expense.category_id')
      .addGroupBy('category.name')
      .orderBy('total', 'DESC')
      .getRawMany<{
        categoryId: string;
        categoryName: string;
        count: string;
        total: string;
      }>();

    return {
      currency: this.currency(),
      period: this.period(query.from, query.to),
      totals: {
        count: parseInt(totals?.count ?? '0', 10),
        total: parseFloat(totals?.total ?? '0').toFixed(2),
      },
      byCategory: byCategory.map((row) => ({
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        count: parseInt(row.count, 10),
        total: parseFloat(row.total).toFixed(2),
      })),
    };
  }

  async salesByItem(query: ReportQueryDto) {
    const qb = this.saleLineRepo
      .createQueryBuilder('line')
      .innerJoin('line.sale', 'sale')
      .leftJoin('line.item', 'item')
      .select('item.id', 'itemId')
      .addSelect('item.description', 'description')
      .addSelect('SUM(line.quantity::numeric)', 'quantitySold')
      .addSelect('SUM(line."lineTotal"::numeric)', 'revenue')
      .addSelect(
        'SUM(line.quantity::numeric * line.purchase_cost::numeric)',
        'cost',
      )
      .addSelect(
        'SUM(line."lineTotal"::numeric) - SUM(line.quantity::numeric * line.purchase_cost::numeric)',
        'profit',
      )
      .where('sale.status = :status', { status: DocumentStatus.ACTIVE })
      .groupBy('item.id')
      .addGroupBy('item.description')
      .orderBy('revenue', 'DESC');

    if (query.locationId) {
      qb.andWhere('sale.location_id = :locationId', {
        locationId: query.locationId,
      });
    }
    applyDateRangeToQb(qb, 'sale.created_at', query.from, query.to);

    const rows = await qb.getRawMany<{
      itemId: string;
      description: string;
      quantitySold: string;
      revenue: string;
      cost: string;
      profit: string;
    }>();

    return {
      currency: this.currency(),
      period: this.period(query.from, query.to),
      items: rows.map((row) => {
        const revenue = parseFloat(row.revenue);
        const profit = parseFloat(row.profit);
        return {
          itemId: row.itemId,
          description: row.description,
          quantitySold: parseFloat(row.quantitySold).toFixed(3),
          revenue: revenue.toFixed(2),
          cost: parseFloat(row.cost).toFixed(2),
          profit: profit.toFixed(2),
          marginPercent:
            revenue > 0 ? ((profit / revenue) * 100).toFixed(2) : '0.00',
        };
      }),
    };
  }

  async purchasesByItem(query: ReportQueryDto) {
    const qb = this.purchaseLineRepo
      .createQueryBuilder('line')
      .innerJoin('line.purchase', 'purchase')
      .leftJoin('line.item', 'item')
      .select('item.id', 'itemId')
      .addSelect('item.description', 'description')
      .addSelect('SUM(line.quantity::numeric)', 'quantityPurchased')
      .addSelect('SUM(line."lineTotal"::numeric)', 'total')
      .where('purchase.status = :status', { status: DocumentStatus.ACTIVE })
      .groupBy('item.id')
      .addGroupBy('item.description')
      .orderBy('total', 'DESC');

    if (query.locationId) {
      qb.andWhere('purchase.location_id = :locationId', {
        locationId: query.locationId,
      });
    }
    if (query.supplierId) {
      qb.andWhere('purchase.supplier_id = :supplierId', {
        supplierId: query.supplierId,
      });
    }
    applyDateRangeToQb(qb, 'purchase.created_at', query.from, query.to);

    const rows = await qb.getRawMany<{
      itemId: string;
      description: string;
      quantityPurchased: string;
      total: string;
    }>();

    return {
      currency: this.currency(),
      period: this.period(query.from, query.to),
      items: rows.map((row) => ({
        itemId: row.itemId,
        description: row.description,
        quantityPurchased: parseFloat(row.quantityPurchased).toFixed(3),
        total: parseFloat(row.total).toFixed(2),
      })),
    };
  }

  async inventoryAging() {
    const stockLevels = await this.stockRepo.find({
      relations: { item: true, location: true },
    });

    const today = new Date();
    let totalValue = 0;

    const items = stockLevels.map((stock) => {
      const value =
        parseFloat(stock.quantity) * parseFloat(stock.purchasePrice);
      totalValue += value;
      return {
        itemId: stock.itemId,
        itemDescription: stock.item.description,
        locationId: stock.locationId,
        locationName: stock.location.name,
        quantity: parseFloat(stock.quantity).toFixed(3),
        purchasePrice: parseFloat(stock.purchasePrice).toFixed(2),
        inventoryValue: value.toFixed(2),
        lastUpdated: stock.updatedAt.toISOString(),
        ageDays: Math.floor(
          (today.getTime() - stock.updatedAt.getTime()) / (1000 * 60 * 60 * 24),
        ),
      };
    });

    return {
      currency: this.currency(),
      totalInventoryValue: totalValue.toFixed(2),
      items,
    };
  }

  async customerActivity(query: ReportQueryDto) {
    const qb = this.saleBaseQb(query)
      .leftJoin('sale.customer', 'customer')
      .select('customer.id', 'customerId')
      .addSelect('customer.name', 'customerName')
      .addSelect('COUNT(sale.id)', 'salesCount')
      .addSelect('COALESCE(SUM(sale.total::numeric), 0)', 'totalSpent')
      .groupBy('customer.id')
      .addGroupBy('customer.name')
      .orderBy('totalSpent', 'DESC');

    const rows = await qb.getRawMany<{
      customerId: string;
      customerName: string;
      salesCount: string;
      totalSpent: string;
    }>();

    return {
      currency: this.currency(),
      period: this.period(query.from, query.to),
      customers: rows.map((row) => ({
        customerId: row.customerId,
        customerName: row.customerName,
        salesCount: parseInt(row.salesCount, 10),
        totalSpent: parseFloat(row.totalSpent).toFixed(2),
      })),
    };
  }

  async supplierActivity(query: ReportQueryDto) {
    const qb = this.purchaseBaseQb(query)
      .leftJoin('purchase.supplier', 'supplier')
      .select('supplier.id', 'supplierId')
      .addSelect('supplier.name', 'supplierName')
      .addSelect('COUNT(purchase.id)', 'purchaseCount')
      .addSelect('COALESCE(SUM(purchase.total::numeric), 0)', 'totalPurchased')
      .groupBy('supplier.id')
      .addGroupBy('supplier.name')
      .orderBy('totalPurchased', 'DESC');

    const rows = await qb.getRawMany<{
      supplierId: string;
      supplierName: string;
      purchaseCount: string;
      totalPurchased: string;
    }>();

    return {
      currency: this.currency(),
      period: this.period(query.from, query.to),
      suppliers: rows.map((row) => ({
        supplierId: row.supplierId,
        supplierName: row.supplierName,
        purchaseCount: parseInt(row.purchaseCount, 10),
        totalPurchased: parseFloat(row.totalPurchased).toFixed(2),
      })),
    };
  }

  async commissions(query: ReportQueryDto) {
    const qb = this.saleBaseQb(query)
      .leftJoin('sale.soldByUser', 'rep')
      .select('sale.sold_by_user_id', 'soldByUserId')
      .addSelect('rep.full_name', 'soldByUserName')
      .addSelect('COUNT(sale.id)', 'saleCount')
      .addSelect('COALESCE(SUM(sale.subtotal::numeric), 0)', 'totalSubtotal')
      .addSelect(
        'COALESCE(SUM(sale.commission_amount::numeric), 0)',
        'totalCommission',
      )
      .groupBy('sale.sold_by_user_id')
      .addGroupBy('rep.full_name')
      .orderBy('totalCommission', 'DESC');

    const rows = await qb.getRawMany<{
      soldByUserId: string | null;
      soldByUserName: string | null;
      saleCount: string;
      totalSubtotal: string;
      totalCommission: string;
    }>();

    const reps = rows.map((row) => ({
      soldByUserId: row.soldByUserId,
      soldByUserName: row.soldByUserName,
      saleCount: parseInt(row.saleCount, 10),
      totalSubtotal: parseFloat(row.totalSubtotal).toFixed(2),
      totalCommission: parseFloat(row.totalCommission).toFixed(2),
    }));

    const totalCommission = reps.reduce(
      (sum, r) => sum + parseFloat(r.totalCommission),
      0,
    );

    return {
      currency: this.currency(),
      period: this.period(query.from, query.to),
      totalCommission: totalCommission.toFixed(2),
      reps,
    };
  }

  async credits() {
    const customerRows = await this.customerCreditRepo
      .createQueryBuilder('credit')
      .leftJoin('credit.customer', 'customer')
      .select('customer.id', 'customerId')
      .addSelect('customer.name', 'customerName')
      .addSelect('COUNT(credit.id)', 'creditCount')
      .addSelect('COALESCE(SUM(credit.balance::numeric), 0)', 'outstanding')
      .where('credit.status != :paid', { paid: CreditStatus.PAID })
      .groupBy('customer.id')
      .addGroupBy('customer.name')
      .orderBy('outstanding', 'DESC')
      .getRawMany<{
        customerId: string;
        customerName: string;
        creditCount: string;
        outstanding: string;
      }>();

    const supplierRows = await this.supplierCreditRepo
      .createQueryBuilder('credit')
      .leftJoin('credit.supplier', 'supplier')
      .select('supplier.id', 'supplierId')
      .addSelect('supplier.name', 'supplierName')
      .addSelect('COUNT(credit.id)', 'creditCount')
      .addSelect('COALESCE(SUM(credit.balance::numeric), 0)', 'outstanding')
      .where('credit.status != :paid', { paid: CreditStatus.PAID })
      .groupBy('supplier.id')
      .addGroupBy('supplier.name')
      .orderBy('outstanding', 'DESC')
      .getRawMany<{
        supplierId: string;
        supplierName: string;
        creditCount: string;
        outstanding: string;
      }>();

    const customerOutstanding = customerRows.reduce(
      (sum, r) => sum + parseFloat(r.outstanding),
      0,
    );
    const supplierOutstanding = supplierRows.reduce(
      (sum, r) => sum + parseFloat(r.outstanding),
      0,
    );

    return {
      currency: this.currency(),
      customers: {
        totalOutstanding: customerOutstanding.toFixed(2),
        creditCount: customerRows.reduce(
          (sum, r) => sum + parseInt(r.creditCount, 10),
          0,
        ),
        byCustomer: customerRows.map((row) => ({
          customerId: row.customerId,
          customerName: row.customerName,
          creditCount: parseInt(row.creditCount, 10),
          outstanding: parseFloat(row.outstanding).toFixed(2),
        })),
      },
      suppliers: {
        totalOutstanding: supplierOutstanding.toFixed(2),
        creditCount: supplierRows.reduce(
          (sum, r) => sum + parseInt(r.creditCount, 10),
          0,
        ),
        bySupplier: supplierRows.map((row) => ({
          supplierId: row.supplierId,
          supplierName: row.supplierName,
          creditCount: parseInt(row.creditCount, 10),
          outstanding: parseFloat(row.outstanding).toFixed(2),
        })),
      },
    };
  }

  private transactionDirection(type: BankTransactionType): 'in' | 'out' | null {
    switch (type) {
      case BankTransactionType.SALE:
      case BankTransactionType.CREDIT_RECEIPT:
      case BankTransactionType.OPENING:
        return 'in';
      case BankTransactionType.PURCHASE:
      case BankTransactionType.EXPENSE:
      case BankTransactionType.CREDIT_PAYMENT:
        return 'out';
      default:
        return null;
    }
  }

  async cashFlow(query: ReportQueryDto) {
    const qb = this.bankTransactionRepo.createQueryBuilder('transaction');
    applyDateRangeToQb(qb, 'transaction.created_at', query.from, query.to);

    const transactions = await qb
      .orderBy('transaction.created_at', 'ASC')
      .getMany();

    const grouped = new Map<string, { inflow: number; outflow: number }>();
    let totalInflow = 0;
    let totalOutflow = 0;

    for (const tx of transactions) {
      const direction = this.transactionDirection(tx.type);
      if (!direction) continue;

      const amount = parseFloat(tx.amount);
      const date = tx.createdAt.toISOString().slice(0, 10);
      const row = grouped.get(date) ?? { inflow: 0, outflow: 0 };

      if (direction === 'in') {
        row.inflow += amount;
        totalInflow += amount;
      } else {
        row.outflow += amount;
        totalOutflow += amount;
      }
      grouped.set(date, row);
    }

    const dailyBalances = [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { inflow, outflow }]) => ({
        date,
        inflow: inflow.toFixed(2),
        outflow: outflow.toFixed(2),
        net: (inflow - outflow).toFixed(2),
      }));

    return {
      currency: this.currency(),
      period: this.period(query.from, query.to),
      totals: {
        inflow: totalInflow.toFixed(2),
        outflow: totalOutflow.toFixed(2),
        net: (totalInflow - totalOutflow).toFixed(2),
      },
      dailyBalances,
    };
  }
}
