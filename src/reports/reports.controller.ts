import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { ReportQueryDto } from './report-query.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  @RequirePermissions('reports.read')
  summary(@Query() query: ReportQueryDto) {
    return this.reportsService.summary(query);
  }

  /** @deprecated use GET /reports/summary */
  @Get('financial-summary')
  @RequirePermissions('reports.read')
  financialSummary(@Query() query: ReportQueryDto) {
    return this.reportsService.summary(query);
  }

  @Get('sales')
  @RequirePermissions('reports.read')
  sales(@Query() query: ReportQueryDto) {
    return this.reportsService.sales(query);
  }

  @Get('purchases')
  @RequirePermissions('reports.read')
  purchases(@Query() query: ReportQueryDto) {
    return this.reportsService.purchases(query);
  }

  @Get('expenses')
  @RequirePermissions('reports.read')
  expenses(@Query() query: ReportQueryDto) {
    return this.reportsService.expenses(query);
  }

  @Get('sales-by-item')
  @RequirePermissions('reports.read')
  salesByItem(@Query() query: ReportQueryDto) {
    return this.reportsService.salesByItem(query);
  }

  @Get('purchases-by-item')
  @RequirePermissions('reports.read')
  purchasesByItem(@Query() query: ReportQueryDto) {
    return this.reportsService.purchasesByItem(query);
  }

  @Get('inventory-aging')
  @RequirePermissions('reports.read')
  inventoryAging() {
    return this.reportsService.inventoryAging();
  }

  @Get('customer-activity')
  @RequirePermissions('reports.read')
  customerActivity(@Query() query: ReportQueryDto) {
    return this.reportsService.customerActivity(query);
  }

  @Get('supplier-activity')
  @RequirePermissions('reports.read')
  supplierActivity(@Query() query: ReportQueryDto) {
    return this.reportsService.supplierActivity(query);
  }

  @Get('commissions')
  @RequirePermissions('reports.read')
  commissions(@Query() query: ReportQueryDto) {
    return this.reportsService.commissions(query);
  }

  @Get('credits')
  @RequirePermissions('reports.read')
  credits() {
    return this.reportsService.credits();
  }

  @Get('cash-flow')
  @RequirePermissions('reports.read')
  cashFlow(@Query() query: ReportQueryDto) {
    return this.reportsService.cashFlow(query);
  }
}
