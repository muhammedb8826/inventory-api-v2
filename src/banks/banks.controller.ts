import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { BankTransactionsQueryDto } from './dto/bank-transactions-query.dto';
import {
  CreateBankAccountDto,
  UpdateBankAccountDto,
} from './dto/bank-account.dto';
import { BankAccountsQueryDto } from './dto/bank-accounts-query.dto';
import { BanksService } from './banks.service';

@Controller('banks')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BanksController {
  constructor(private readonly service: BanksService) {}

  @Get('accounts')
  @RequirePermissions('bank.read')
  findAccounts(@Query() query: BankAccountsQueryDto) {
    return this.service.findAccounts({
      type: query.type,
      includeInactive: query.includeInactive === 'true',
      search: query.search,
    });
  }

  @Get('liquidity')
  @RequirePermissions('bank.read')
  liquidity() {
    return this.service.getLiquiditySummary();
  }

  @Get('accounts/:id')
  @RequirePermissions('bank.read')
  findAccount(@Param('id') id: string) {
    return this.service.findAccount(id);
  }

  @Post('accounts')
  @RequirePermissions('bank.write')
  createAccount(@Body() dto: CreateBankAccountDto) {
    return this.service.createAccount(dto);
  }

  @Patch('accounts/:id')
  @RequirePermissions('bank.write')
  updateAccount(@Param('id') id: string, @Body() dto: UpdateBankAccountDto) {
    return this.service.updateAccount(id, dto);
  }

  @Get('transactions')
  @RequirePermissions('bank.read')
  findTransactions(@Query() query: BankTransactionsQueryDto) {
    return this.service.findTransactions(query);
  }

  @Post('transactions/adjustment')
  @RequirePermissions('bank.write')
  adjustment(
    @Body()
    body: {
      bankAccountId: string;
      amount: number;
      direction: 'in' | 'out';
      description?: string;
    },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.manualAdjustment(
      body.bankAccountId,
      body.amount,
      body.direction,
      body.description,
      user.sub,
    );
  }
}
