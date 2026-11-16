import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import {
  ConvertQtyDto,
  CreateUomCategoryDto,
  CreateUomDto,
  UpdateUomCategoryDto,
  UpdateUomDto,
  UpsertItemUomDto,
} from './dto/uom.dto';
import { UomService } from './uom.service';

@Controller('uom')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UomController {
  constructor(private readonly service: UomService) {}

  @Get('categories')
  @RequirePermissions('uom.read')
  categories(@Query('includeInactive') includeInactive?: string) {
    return this.service.listCategories(includeInactive === 'true');
  }

  @Get('categories/:id')
  @RequirePermissions('uom.read')
  category(@Param('id') id: string) {
    return this.service.findCategory(id, true);
  }

  @Post('categories')
  @RequirePermissions('uom.write')
  createCategory(@Body() dto: CreateUomCategoryDto) {
    return this.service.createCategory(dto);
  }

  @Patch('categories/:id')
  @RequirePermissions('uom.write')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateUomCategoryDto) {
    return this.service.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @RequirePermissions('uom.write')
  deleteCategory(@Param('id') id: string) {
    return this.service.deleteCategory(id);
  }

  @Get('units')
  @RequirePermissions('uom.read')
  units(
    @Query('categoryId') categoryId?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.service.listUoms(categoryId, includeInactive === 'true');
  }

  @Get('units/:id')
  @RequirePermissions('uom.read')
  unit(@Param('id') id: string) {
    return this.service.findUom(id);
  }

  @Post('units')
  @RequirePermissions('uom.write')
  createUnit(@Body() dto: CreateUomDto) {
    return this.service.createUom(dto);
  }

  @Patch('units/:id')
  @RequirePermissions('uom.write')
  updateUnit(@Param('id') id: string, @Body() dto: UpdateUomDto) {
    return this.service.updateUom(id, dto);
  }

  @Delete('units/:id')
  @RequirePermissions('uom.write')
  deleteUnit(@Param('id') id: string) {
    return this.service.deleteUom(id);
  }

  @Get('items/:itemId')
  @RequirePermissions('uom.read')
  itemUoms(@Param('itemId') itemId: string) {
    return this.service.listItemUoms(itemId);
  }

  @Post('items/:itemId')
  @RequirePermissions('uom.write')
  upsertItemUom(
    @Param('itemId') itemId: string,
    @Body() dto: UpsertItemUomDto,
  ) {
    return this.service.upsertItemUom(itemId, dto);
  }

  @Delete('items/:itemId/:uomId')
  @RequirePermissions('uom.write')
  removeItemUom(
    @Param('itemId') itemId: string,
    @Param('uomId') uomId: string,
  ) {
    return this.service.removeItemUom(itemId, uomId);
  }

  @Post('convert')
  @RequirePermissions('uom.read')
  convert(@Body() dto: ConvertQtyDto) {
    return this.service.convert(dto);
  }
}
