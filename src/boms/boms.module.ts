import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BomLine } from '../database/entities/bom-line.entity';
import { Bom } from '../database/entities/bom.entity';
import { Item } from '../database/entities/item.entity';
import { UomModule } from '../uom/uom.module';
import { BomsController } from './boms.controller';
import { BomsService } from './boms.service';

@Module({
  imports: [TypeOrmModule.forFeature([Bom, BomLine, Item]), UomModule],
  controllers: [BomsController],
  providers: [BomsService],
  exports: [BomsService],
})
export class BomsModule {}
