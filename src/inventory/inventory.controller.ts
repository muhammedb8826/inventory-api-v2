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
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
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
import type {
  UploadedExcelFile,
  UploadedImageFile,
} from './dto/uploaded-file.interface';
import { InventoryService } from './inventory.service';

type RequestLike = {
  protocol: string;
  headers: Record<string, string | string[] | undefined>;
  get: (name: string) => string | undefined;
};

function requestBaseUrl(req: RequestLike) {
  const proto =
    (typeof req.headers['x-forwarded-proto'] === 'string'
      ? req.headers['x-forwarded-proto']
      : undefined) || req.protocol;
  const host = req.get('host');
  return host ? `${proto}://${host}` : undefined;
}

@Controller('inventory')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @RequirePermissions('inventory.read')
  findAll(@Req() req: RequestLike, @Query() query: InventoryListQueryDto) {
    return this.inventoryService.findAll(query, requestBaseUrl(req));
  }

  @Get('low-stock')
  @RequirePermissions('inventory.read')
  findLowStock(
    @Req() req: RequestLike,
    @Query() query: LowStockListQueryDto,
  ) {
    return this.inventoryService.findLowStock(query, requestBaseUrl(req));
  }

  @Get('adjustments')
  @RequirePermissions('inventory.read')
  findAdjustments(
    @Req() req: RequestLike,
    @Query() query: StockAdjustmentListQueryDto,
  ) {
    return this.inventoryService.findAdjustments(query, requestBaseUrl(req));
  }

  @Post('adjustments')
  @RequirePermissions('inventory.adjust')
  createAdjustment(
    @Body() dto: CreateStockAdjustmentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.inventoryService.createAdjustment(dto, user.sub);
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

  @Get(':id')
  @RequirePermissions('inventory.read')
  findOne(@Req() req: RequestLike, @Param('id') id: string) {
    return this.inventoryService.findOne(id, requestBaseUrl(req));
  }

  @Post()
  @RequirePermissions('inventory.write')
  create(@Req() req: RequestLike, @Body() dto: CreateInventoryDto) {
    return this.inventoryService.create(dto, requestBaseUrl(req));
  }

  @Patch(':id')
  @RequirePermissions('inventory.write')
  update(
    @Req() req: RequestLike,
    @Param('id') id: string,
    @Body() dto: UpdateInventoryDto,
  ) {
    return this.inventoryService.update(id, dto, requestBaseUrl(req));
  }

  @Post(':id/image')
  @RequirePermissions('inventory.write')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadImage(
    @Req() req: RequestLike,
    @Param('id') id: string,
    @UploadedFile() file: UploadedImageFile,
  ) {
    return this.inventoryService.uploadItemImage(
      id,
      file,
      requestBaseUrl(req),
    );
  }

  @Delete(':id/image')
  @RequirePermissions('inventory.write')
  clearImage(@Req() req: RequestLike, @Param('id') id: string) {
    return this.inventoryService.clearItemImage(id, requestBaseUrl(req));
  }

  @Delete(':id')
  @RequirePermissions('inventory.delete')
  remove(@Param('id') id: string) {
    return this.inventoryService.remove(id);
  }
}
