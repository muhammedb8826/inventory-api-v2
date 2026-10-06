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
import { CreditListQueryDto } from './dto/credit-list-query.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CreditsService } from './credits.service';
import { CreditPaymentDto } from './dto/credit-payment.dto';
import {
  CreateOpeningCustomerCreditDto,
  CreateOpeningSupplierCreditDto,
} from './dto/opening-credit.dto';

@Controller('credits')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CreditsController {
  constructor(private readonly service: CreditsService) {}

  @Get('customers')
  @RequirePermissions('credit.read')
  customerCredits(@Query() query: CreditListQueryDto) {
    return this.service.findCustomerCredits(query);
  }

  @Get('suppliers')
  @RequirePermissions('credit.read')
  supplierCredits(@Query() query: CreditListQueryDto) {
    return this.service.findSupplierCredits(query);
  }

  @Post('customers')
  @RequirePermissions('credit.write')
  createOpeningCustomer(@Body() dto: CreateOpeningCustomerCreditDto) {
    return this.service.createOpeningCustomerCredit(dto);
  }

  @Post('suppliers')
  @RequirePermissions('credit.write')
  createOpeningSupplier(@Body() dto: CreateOpeningSupplierCreditDto) {
    return this.service.createOpeningSupplierCredit(dto);
  }

  @Delete('customers/:id')
  @RequirePermissions('credit.write')
  removeOpeningCustomer(@Param('id') id: string) {
    return this.service.removeOpeningCustomerCredit(id);
  }

  @Delete('suppliers/:id')
  @RequirePermissions('credit.write')
  removeOpeningSupplier(@Param('id') id: string) {
    return this.service.removeOpeningSupplierCredit(id);
  }

  @Post('customers/:id/payments')
  @RequirePermissions('credit.write')
  payCustomer(
    @Param('id') id: string,
    @Body() dto: CreditPaymentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.payCustomerCredit(id, dto, user.sub);
  }

  @Post('suppliers/:id/payments')
  @RequirePermissions('credit.write')
  paySupplier(
    @Param('id') id: string,
    @Body() dto: CreditPaymentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.paySupplierCredit(id, dto, user.sub);
  }
}
