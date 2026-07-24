import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BanksModule } from '../banks/banks.module';
import { BankAccount } from '../database/entities/bank-account.entity';
import { Expense } from '../database/entities/expense.entity';
import { Location } from '../database/entities/location.entity';
import { Purchase } from '../database/entities/purchase.entity';
import { Sale } from '../database/entities/sale.entity';
import { SaleLine } from '../database/entities/sale-line.entity';
import { StockLevel } from '../database/entities/stock-level.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    BanksModule,
    TypeOrmModule.forFeature([
      StockLevel,
      Location,
      Sale,
      Purchase,
      SaleLine,
      BankAccount,
      Expense,
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
