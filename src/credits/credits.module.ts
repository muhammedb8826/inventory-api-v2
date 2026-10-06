import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BanksModule } from '../banks/banks.module';
import { Customer } from '../database/entities/customer.entity';
import { CustomerCredit } from '../database/entities/customer-credit.entity';
import { Supplier } from '../database/entities/supplier.entity';
import { SupplierCredit } from '../database/entities/supplier-credit.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { CreditsController } from './credits.controller';
import { CreditsService } from './credits.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CustomerCredit,
      SupplierCredit,
      Customer,
      Supplier,
    ]),
    BanksModule,
    NotificationsModule,
  ],
  controllers: [CreditsController],
  providers: [CreditsService],
})
export class CreditsModule {}
