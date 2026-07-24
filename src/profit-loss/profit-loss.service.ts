import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { getAppCurrency } from '../common/utils/currency.util';
import { Repository } from 'typeorm';
import { DocumentStatus } from '../common/enums';
import { applyDateRangeToQb } from '../common/utils/query.util';
import { Expense } from '../database/entities/expense.entity';
import { SaleLine } from '../database/entities/sale-line.entity';

@Injectable()
export class ProfitLossService {
  constructor(
    private readonly config: ConfigService,
    @InjectRepository(SaleLine)
    private readonly saleLineRepo: Repository<SaleLine>,
    @InjectRepository(Expense)
    private readonly expenseRepo: Repository<Expense>,
  ) {}

  private async loadSaleLines(from?: string, to?: string) {
    const qb = this.saleLineRepo
      .createQueryBuilder('line')
      .leftJoinAndSelect('line.item', 'item')
      .innerJoin('line.sale', 'sale')
      .andWhere('sale.status = :status', { status: DocumentStatus.ACTIVE });
    applyDateRangeToQb(qb, 'sale.created_at', from, to);
    return qb.getMany();
  }

  private async loadExpenses(from?: string, to?: string) {
    const qb = this.expenseRepo.createQueryBuilder('expense');
    applyDateRangeToQb(qb, 'expense.expense_date', from, to);
    return qb.getMany();
  }

  async byItem(from?: string, to?: string) {
    const lines = await this.loadSaleLines(from, to);
    const map = new Map<
      string,
      {
        itemId: string;
        description: string;
        quantitySold: number;
        revenue: number;
        cost: number;
        profit: number;
      }
    >();

    for (const line of lines) {
      const itemId = line.itemId;
      const existing = map.get(itemId) ?? {
        itemId,
        description: line.item?.description ?? itemId,
        quantitySold: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
      };
      const qty = parseFloat(line.quantity);
      const revenue = parseFloat(line.lineTotal);
      const cost = qty * parseFloat(line.purchaseCost);
      existing.quantitySold += qty;
      existing.revenue += revenue;
      existing.cost += cost;
      existing.profit += revenue - cost;
      map.set(itemId, existing);
    }

    return [...map.values()].map((row) => ({
      ...row,
      quantitySold: row.quantitySold.toFixed(3),
      revenue: row.revenue.toFixed(2),
      cost: row.cost.toFixed(2),
      profit: row.profit.toFixed(2),
      marginPercent:
        row.revenue > 0
          ? ((row.profit / row.revenue) * 100).toFixed(2)
          : '0.00',
    }));
  }

  async summary(from?: string, to?: string) {
    const lines = await this.loadSaleLines(from, to);
    let revenue = 0;
    let cost = 0;
    for (const line of lines) {
      revenue += parseFloat(line.lineTotal);
      cost += parseFloat(line.quantity) * parseFloat(line.purchaseCost);
    }
    const expenses = await this.loadExpenses(from, to);
    const totalExpenses = expenses.reduce(
      (sum, e) => sum + parseFloat(e.amount),
      0,
    );
    const grossProfit = revenue - cost;
    const netProfit = grossProfit - totalExpenses;
    return {
      currency: getAppCurrency(this.config),
      revenue: revenue.toFixed(2),
      costOfGoodsSold: cost.toFixed(2),
      grossProfit: grossProfit.toFixed(2),
      totalExpenses: totalExpenses.toFixed(2),
      netProfit: netProfit.toFixed(2),
      marginPercent:
        revenue > 0 ? ((grossProfit / revenue) * 100).toFixed(2) : '0.00',
    };
  }
}
