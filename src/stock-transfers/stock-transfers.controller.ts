import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { StockTransferListQueryDto } from './dto/stock-transfer-list-query.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CreateStockTransferDto } from './dto/stock-transfer.dto';
import { StockTransfersService } from './stock-transfers.service';

@Controller('stock-transfers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StockTransfersController {
  constructor(private readonly service: StockTransfersService) {}

  @Get()
  @RequirePermissions('stock_transfer.read')
  findAll(@Query() query: StockTransferListQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('stock_transfer.read')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('stock_transfer.write')
  create(@Body() dto: CreateStockTransferDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(dto, user.sub);
  }

  @Delete(':id')
  @RequirePermissions('stock_transfer.write')
  void(@Param('id') id: string) {
    return this.service.void(id);
  }
}
