import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductAttribute } from '../database/entities/product-attribute.entity';
import { ProductAttributeValue } from '../database/entities/product-attribute-value.entity';
import { AttributesController } from './attributes.controller';
import { AttributesService } from './attributes.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProductAttribute, ProductAttributeValue]),
  ],
  controllers: [AttributesController],
  providers: [AttributesService],
  exports: [AttributesService],
})
export class AttributesModule {}
