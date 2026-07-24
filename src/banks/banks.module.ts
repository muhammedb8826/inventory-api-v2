import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankAccount } from '../database/entities/bank-account.entity';
import { BankTransaction } from '../database/entities/bank-transaction.entity';
import { BankLedgerService } from './bank-ledger.service';
import { BanksController } from './banks.controller';
import { BanksService } from './banks.service';

@Module({
  imports: [TypeOrmModule.forFeature([BankAccount, BankTransaction])],
  controllers: [BanksController],
  providers: [BanksService, BankLedgerService],
  exports: [BankLedgerService, BanksService],
})
export class BanksModule {}
