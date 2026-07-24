import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from '../database/entities/notification.entity';
import { StockLevel } from '../database/entities/stock-level.entity';
import { User } from '../database/entities/user.entity';
import { LowStockService } from './low-stock.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, User, StockLevel])],
  controllers: [NotificationsController],
  providers: [NotificationsService, LowStockService],
  exports: [NotificationsService, LowStockService],
})
export class NotificationsModule {}
