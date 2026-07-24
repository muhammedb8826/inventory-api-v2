import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Item } from '../database/entities/item.entity';
import { Location } from '../database/entities/location.entity';
import { StockAdjustment } from '../database/entities/stock-adjustment.entity';
import { StockLevel } from '../database/entities/stock-level.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { StockService } from './stock.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([StockLevel, Item, Location, StockAdjustment]),
    NotificationsModule,
  ],
  controllers: [InventoryController],
  providers: [InventoryService, StockService],
  exports: [StockService, InventoryService],
})
export class InventoryModule {}
