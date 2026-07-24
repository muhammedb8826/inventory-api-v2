import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { IsDateString, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { ProfitLossService } from './profit-loss.service';

class ProfitLossQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

@Controller('profit-loss')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProfitLossController {
  constructor(private readonly service: ProfitLossService) {}

  @Get('summary')
  @RequirePermissions('profit_loss.read')
  summary(@Query() query: ProfitLossQueryDto) {
    return this.service.summary(query.from, query.to);
  }

  @Get('by-item')
  @RequirePermissions('profit_loss.read')
  byItem(@Query() query: ProfitLossQueryDto) {
    return this.service.byItem(query.from, query.to);
  }
}
