import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Expense } from '../database/entities/expense.entity';
import { SaleLine } from '../database/entities/sale-line.entity';
import { ProfitLossController } from './profit-loss.controller';
import { ProfitLossService } from './profit-loss.service';

@Module({
  imports: [TypeOrmModule.forFeature([SaleLine, Expense])],
  controllers: [ProfitLossController],
  providers: [ProfitLossService],
})
export class ProfitLossModule {}
