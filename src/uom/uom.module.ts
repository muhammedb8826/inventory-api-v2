import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Item } from '../database/entities/item.entity';
import { ItemUom } from '../database/entities/item-uom.entity';
import { Uom } from '../database/entities/uom.entity';
import { UomCategory } from '../database/entities/uom-category.entity';
import { UomController } from './uom.controller';
import { UomConversionService } from './uom-conversion.service';
import { UomService } from './uom.service';

@Module({
  imports: [TypeOrmModule.forFeature([UomCategory, Uom, ItemUom, Item])],
  controllers: [UomController],
  providers: [UomService, UomConversionService],
  exports: [UomService, UomConversionService],
})
export class UomModule {}
