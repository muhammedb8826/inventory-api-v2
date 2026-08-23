import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../database/entities/customer.entity';
import { CustomerInquiryLine } from '../database/entities/customer-inquiry-line.entity';
import { CustomerInquiry } from '../database/entities/customer-inquiry.entity';
import { Item } from '../database/entities/item.entity';
import { Sale } from '../database/entities/sale.entity';
import { User } from '../database/entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { InquiriesController } from './inquiries.controller';
import { InquiriesService } from './inquiries.service';
import { PublicInquiriesController } from './public-inquiries.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CustomerInquiry,
      CustomerInquiryLine,
      Customer,
      Item,
      User,
      Sale,
    ]),
    NotificationsModule,
  ],
  controllers: [InquiriesController, PublicInquiriesController],
  providers: [InquiriesService],
  exports: [InquiriesService],
})
export class InquiriesModule {}
