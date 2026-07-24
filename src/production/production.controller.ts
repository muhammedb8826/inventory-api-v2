import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import {
  CompleteProductionDto,
  CreateProductionOrderDto,
  IssueProductionDto,
  ProductionOrderListQueryDto,
} from './dto/production-order.dto';
import { ProductionService } from './production.service';

@Controller('production-orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductionController {
  constructor(private readonly productionService: ProductionService) {}

  @Get()
  @RequirePermissions('production.read')
  findAll(@Query() query: ProductionOrderListQueryDto) {
    return this.productionService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('production.read')
  findOne(@Param('id') id: string) {
    return this.productionService.findOne(id);
  }

  @Post()
  @RequirePermissions('production.write')
  create(
    @Body() dto: CreateProductionOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.productionService.create(dto, user.sub);
  }

  @Post(':id/release')
  @RequirePermissions('production.write')
  release(@Param('id') id: string) {
    return this.productionService.release(id);
  }

  @Post(':id/issue')
  @RequirePermissions('production.write')
  issue(@Param('id') id: string, @Body() dto: IssueProductionDto) {
    return this.productionService.issue(id, dto);
  }

  @Post(':id/complete')
  @RequirePermissions('production.write')
  complete(@Param('id') id: string, @Body() dto: CompleteProductionDto) {
    return this.productionService.complete(id, dto);
  }

  @Post(':id/cancel')
  @RequirePermissions('production.write')
  cancel(@Param('id') id: string) {
    return this.productionService.cancel(id);
  }
}
