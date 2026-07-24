import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { getAppCurrency } from '../common/utils/currency.util';
import { Repository } from 'typeorm';
import { parseDateRange } from '../common/dto/date-range.dto';
import { applyDateRangeToQb } from '../common/utils/query.util';
import { DocumentStatus, LocationType } from '../common/enums';
import { BanksService } from '../banks/banks.service';
import { BankAccount } from '../database/entities/bank-account.entity';
import { Expense } from '../database/entities/expense.entity';
import { Location } from '../database/entities/location.entity';
import { Purchase } from '../database/entities/purchase.entity';
import { Sale } from '../database/entities/sale.entity';
import { SaleLine } from '../database/entities/sale-line.entity';
import { StockLevel } from '../database/entities/stock-level.entity';

@Injectable()
export class DashboardService {
  constructor(
    private readonly config: ConfigService,
    private readonly banksService: BanksService,
    @InjectRepository(StockLevel)
    private readonly stockRepo: Repository<StockLevel>,
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    @InjectRepository(Sale)
    private readonly saleRepo: Repository<Sale>,
    @InjectRepository(Purchase)
    private readonly purchaseRepo: Repository<Purchase>,
    @InjectRepository(SaleLine)
    private readonly saleLineRepo: Repository<SaleLine>,
    @InjectRepository(BankAccount)
    private readonly bankRepo: Repository<BankAccount>,
    @InjectRepository(Expense)
    private readonly expenseRepo: Repository<Expense>,
  ) {}

  async getOverview(from?: string, to?: string) {
    const period = parseDateRange(from, to);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const stocks = await this.stockRepo.find({
      relations: { location: true, item: true },
    });

    let totalInventoryValue = 0;
    const valueByLocation: Record<string, { name: string; value: number }> = {};

    for (const s of stocks) {
      const value = parseFloat(s.quantity) * parseFloat(s.purchasePrice);
      totalInventoryValue += value;
      const locId = s.locationId;
      if (!valueByLocation[locId]) {
        valueByLocation[locId] = {
          name: s.location?.name ?? locId,
          value: 0,
        };
      }
      valueByLocation[locId].value += value;
    }

    const dailySalesQb = this.saleRepo
      .createQueryBuilder('s')
      .select('COALESCE(SUM(s.total::numeric), 0)', 'total')
      .where('s.created_at >= :start AND s.created_at < :end', {
        start: today,
        end: tomorrow,
      })
      .andWhere('s.status = :status', { status: DocumentStatus.ACTIVE });
    const dailySales = await dailySalesQb.getRawOne<{ total: string }>();

    const dailyPurchases = await this.purchaseRepo
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.total::numeric), 0)', 'total')
      .where('p.created_at >= :start AND p.created_at < :end', {
        start: today,
        end: tomorrow,
      })
      .andWhere('p.status = :status', { status: DocumentStatus.ACTIVE })
      .getRawOne<{ total: string }>();

    const profitAndLoss = await this.computeProfitSummary(
      period.start?.toISOString().slice(0, 10),
      period.end?.toISOString().slice(0, 10),
    );

    const bankAccounts = await this.bankRepo.find({
      where: { isActive: true },
      order: { accountType: 'ASC', name: 'ASC' },
    });
    const liquidityTotals =
      this.banksService.computeLiquidityTotals(bankAccounts);

    const showrooms = await this.locationRepo.find({
      where: { type: LocationType.SHOWROOM, isActive: true },
    });

    return {
      currency: getAppCurrency(this.config),
      totalInventoryValue: totalInventoryValue.toFixed(2),
      stockValueByLocation: Object.entries(valueByLocation).map(
        ([locationId, data]) => ({
          locationId,
          locationName: data.name,
          value: data.value.toFixed(2),
        }),
      ),
      showroomCount: showrooms.length,
      dailySales: parseFloat(dailySales?.total ?? '0').toFixed(2),
      dailyPurchases: parseFloat(dailyPurchases?.total ?? '0').toFixed(2),
      profitAndLoss,
      financialOverview: {
        cashTotal: liquidityTotals.cashTotal,
        bankTotal: liquidityTotals.bankTotal,
        totalLiquidity: liquidityTotals.totalLiquidity,
        /** @deprecated use totalLiquidity */
        totalBankBalance: liquidityTotals.totalLiquidity,
        bankAccounts: bankAccounts.map((a) => ({
          id: a.id,
          name: a.name,
          accountType: a.accountType,
          bankName: a.bankName,
          balance: a.balance,
        })),
      },
      period: {
        from: from ?? null,
        to: to ?? null,
      },
    };
  }

  private async computeProfitSummary(from?: string, to?: string) {
    const saleLinesQb = this.saleLineRepo
      .createQueryBuilder('line')
      .innerJoin('line.sale', 'sale')
      .andWhere('sale.status = :status', { status: DocumentStatus.ACTIVE });
    applyDateRangeToQb(saleLinesQb, 'sale.created_at', from, to);
    const lines = await saleLinesQb.getMany();

    let revenue = 0;
    let cost = 0;
    for (const line of lines) {
      revenue += parseFloat(line.lineTotal);
      cost += parseFloat(line.quantity) * parseFloat(line.purchaseCost);
    }

    const expenseQb = this.expenseRepo.createQueryBuilder('expense');
    applyDateRangeToQb(expenseQb, 'expense.expense_date', from, to);
    const expenses = await expenseQb.getMany();
    const totalExpenses = expenses.reduce(
      (sum, e) => sum + parseFloat(e.amount),
      0,
    );

    const grossProfit = revenue - cost;
    const netProfit = grossProfit - totalExpenses;
    return {
      revenue: revenue.toFixed(2),
      costOfGoodsSold: cost.toFixed(2),
      grossProfit: grossProfit.toFixed(2),
      totalExpenses: totalExpenses.toFixed(2),
      netProfit: netProfit.toFixed(2),
    };
  }
}
