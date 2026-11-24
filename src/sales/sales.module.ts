import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BanksModule } from '../banks/banks.module';
import { Bom } from '../database/entities/bom.entity';
import { CustomerCredit } from '../database/entities/customer-credit.entity';
import { Item } from '../database/entities/item.entity';
import { Sale } from '../database/entities/sale.entity';
import { SaleLineComponent } from '../database/entities/sale-line-component.entity';
import { User } from '../database/entities/user.entity';
import { InventoryModule } from '../inventory/inventory.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProductionModule } from '../production/production.module';
import { SettingsModule } from '../settings/settings.module';
import { UomModule } from '../uom/uom.module';
import { KitSaleService } from './kit-sale.service';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Sale,
      CustomerCredit,
      User,
      Bom,
      Item,
      SaleLineComponent,
    ]),
    InventoryModule,
    BanksModule,
    NotificationsModule,
    UomModule,
    ProductionModule,
    SettingsModule,
  ],
  controllers: [SalesController],
  providers: [SalesService, KitSaleService],
})
export class SalesModule {}
