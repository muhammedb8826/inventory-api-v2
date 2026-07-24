import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CommissionSummaryQueryDto } from './dto/commission-summary-query.dto';
import { CreateSaleDto } from './dto/sale.dto';
import { SalesListQueryDto } from './dto/sales-list-query.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { SalesService } from './sales.service';

@Controller('sales')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SalesController {
  constructor(private readonly service: SalesService) {}

  @Get()
  @RequirePermissions('sales.read')
  findAll(@Query() query: SalesListQueryDto) {
    return this.service.findAll(query);
  }

  @Get('commissions/summary')
  @RequirePermissions('sales.read')
  commissionSummary(@Query() query: CommissionSummaryQueryDto) {
    return this.service.commissionSummary(query);
  }

  @Get(':id')
  @RequirePermissions('sales.read')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('sales.write')
  create(
    @Body() dto: CreateSaleDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request & { permissions?: string[] },
  ) {
    const perms = req.permissions ?? [];
    const canNegative = perms.includes('sales.negative_stock');
    const canOnBehalf = perms.includes('sales.on_behalf');
    return this.service.create(dto, user.sub, canNegative, canOnBehalf);
  }

  @Patch(':id')
  @RequirePermissions('sales.write')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSaleDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request & { permissions?: string[] },
  ) {
    const perms = req.permissions ?? [];
    const canNegative = perms.includes('sales.negative_stock');
    const canOnBehalf = perms.includes('sales.on_behalf');
    return this.service.update(id, dto, user.sub, canNegative, canOnBehalf);
  }

  @Delete(':id')
  @RequirePermissions('sales.write')
  void(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.void(id, user.sub);
  }
}
