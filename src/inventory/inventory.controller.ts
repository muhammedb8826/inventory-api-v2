import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CreateInventoryDto, UpdateInventoryDto } from './dto/inventory.dto';
import { InventoryListQueryDto } from './dto/inventory-list-query.dto';
import { LowStockListQueryDto } from './dto/low-stock-list-query.dto';
import {
  CreateStockAdjustmentDto,
  StockAdjustmentListQueryDto,
} from './dto/stock-adjustment.dto';
import type { UploadedExcelFile } from './dto/uploaded-file.interface';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @RequirePermissions('inventory.read')
  findAll(@Query() query: InventoryListQueryDto) {
    return this.inventoryService.findAll(query);
  }

  @Get('low-stock')
  @RequirePermissions('inventory.read')
  findLowStock(@Query() query: LowStockListQueryDto) {
    return this.inventoryService.findLowStock(query);
  }

  @Get('adjustments')
  @RequirePermissions('inventory.read')
  findAdjustments(@Query() query: StockAdjustmentListQueryDto) {
    return this.inventoryService.findAdjustments(query);
  }

  @Post('adjustments')
  @RequirePermissions('inventory.adjust')
  createAdjustment(
    @Body() dto: CreateStockAdjustmentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.inventoryService.createAdjustment(dto, user.sub);
  }

  @Get(':id')
  @RequirePermissions('inventory.read')
  findOne(@Param('id') id: string) {
    return this.inventoryService.findOne(id);
  }

  @Post()
  @RequirePermissions('inventory.write')
  create(@Body() dto: CreateInventoryDto) {
    return this.inventoryService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('inventory.write')
  update(@Param('id') id: string, @Body() dto: UpdateInventoryDto) {
    return this.inventoryService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('inventory.delete')
  remove(@Param('id') id: string) {
    return this.inventoryService.remove(id);
  }

  @Post('import')
  @RequirePermissions('inventory.import')
  @UseInterceptors(FileInterceptor('file'))
  importExcel(
    @Query('locationId') locationId: string,
    @UploadedFile() file: UploadedExcelFile,
  ) {
    if (!file) throw new BadRequestException('File is required');
    if (!locationId)
      throw new BadRequestException('locationId query param is required');
    return this.inventoryService.bulkImport(locationId, file);
  }
}
