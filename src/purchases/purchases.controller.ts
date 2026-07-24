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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { PurchaseListQueryDto } from './dto/purchase-list-query.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CreatePurchaseDto } from './dto/purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';
import { PurchasesService } from './purchases.service';

@Controller('purchases')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PurchasesController {
  constructor(private readonly service: PurchasesService) {}

  @Get()
  @RequirePermissions('purchase.read')
  findAll(@Query() query: PurchaseListQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('purchase.read')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('purchase.write')
  create(@Body() dto: CreatePurchaseDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(dto, user.sub);
  }

  @Patch(':id')
  @RequirePermissions('purchase.write')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.update(id, dto, user.sub);
  }

  @Delete(':id')
  @RequirePermissions('purchase.write')
  void(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.void(id, user.sub);
  }
}
