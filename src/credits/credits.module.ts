import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BanksModule } from '../banks/banks.module';
import { CustomerCredit } from '../database/entities/customer-credit.entity';
import { SupplierCredit } from '../database/entities/supplier-credit.entity';
import { CreditsController } from './credits.controller';
import { CreditsService } from './credits.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CustomerCredit, SupplierCredit]),
    BanksModule,
  ],
  controllers: [CreditsController],
  providers: [CreditsService],
})
export class CreditsModule {}
