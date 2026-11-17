import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Item } from '../database/entities/item.entity';
import { ItemAttributeValue } from '../database/entities/item-attribute-value.entity';
import { Location } from '../database/entities/location.entity';
import { ProductAttributeValue } from '../database/entities/product-attribute-value.entity';
import { StockAdjustment } from '../database/entities/stock-adjustment.entity';
import { StockLevel } from '../database/entities/stock-level.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { UomModule } from '../uom/uom.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { StockService } from './stock.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StockLevel,
      Item,
      Location,
      StockAdjustment,
      ItemAttributeValue,
      ProductAttributeValue,
    ]),
    NotificationsModule,
    UomModule,
  ],
  controllers: [InventoryController],
  providers: [InventoryService, StockService],
  exports: [StockService, InventoryService],
})
export class InventoryModule {}
