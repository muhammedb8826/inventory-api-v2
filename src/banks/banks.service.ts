import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  BankAccountType,
  BankTransactionType,
  PaymentMethod,
} from '../common/enums';
import {
  applyDateRangeToQb,
  applyIlikeSearch,
  paginatedQueryBuilder,
} from '../common/utils/query.util';
import { BankTransactionsQueryDto } from './dto/bank-transactions-query.dto';
import { BankAccount } from '../database/entities/bank-account.entity';
import { BankTransaction } from '../database/entities/bank-transaction.entity';
import { BankLedgerService } from './bank-ledger.service';
import {
  CreateBankAccountDto,
  UpdateBankAccountDto,
} from './dto/bank-account.dto';

export interface LiquidityTotals {
  cashTotal: string;
  bankTotal: string;
  totalLiquidity: string;
}

@Injectable()
export class BanksService {
  constructor(
    @InjectRepository(BankAccount)
    private readonly accountRepo: Repository<BankAccount>,
    @InjectRepository(BankTransaction)
    private readonly txRepo: Repository<BankTransaction>,
    private readonly ledger: BankLedgerService,
  ) {}

  computeLiquidityTotals(accounts: BankAccount[]): LiquidityTotals {
    let cash = 0;
    let bank = 0;
    for (const a of accounts) {
      const bal = parseFloat(a.balance);
      if (a.accountType === BankAccountType.CASH) {
        cash += bal;
      } else {
        bank += bal;
      }
    }
    return {
      cashTotal: cash.toFixed(2),
      bankTotal: bank.toFixed(2),
      totalLiquidity: (cash + bank).toFixed(2),
    };
  }

  findAccounts(query: {
    type?: BankAccountType;
    includeInactive?: boolean;
    search?: string;
  }) {
    const qb = this.accountRepo
      .createQueryBuilder('account')
      .orderBy('account.account_type', 'ASC')
      .addOrderBy('account.name', 'ASC');

    if (!query.includeInactive) {
      qb.andWhere('account.is_active = true');
    }
    if (query.type) {
      qb.andWhere('account.account_type = :type', { type: query.type });
    }
    applyIlikeSearch(qb, query.search, [
      'account.name',
      'account.bank_name',
      'account.account_number',
      'account.account_holder_name',
    ]);

    return qb.getMany();
  }

  async getLiquiditySummary() {
    const accounts = await this.findAccounts({});
    return {
      accounts,
      totals: this.computeLiquidityTotals(accounts),
    };
  }

  async findAccount(id: string) {
    const account = await this.accountRepo.findOne({ where: { id } });
    if (!account) throw new NotFoundException('Bank account not found');
    return account;
  }

  createAccount(dto: CreateBankAccountDto) {
    return this.accountRepo.save(
      this.accountRepo.create({
        name: dto.name,
        accountType: dto.accountType,
        bankName: dto.bankName ?? null,
        accountHolderName: dto.accountHolderName ?? null,
        accountNumber: dto.accountNumber ?? null,
        balance: (dto.balance ?? 0).toFixed(2),
      }),
    );
  }

  async updateAccount(id: string, dto: UpdateBankAccountDto) {
    const account = await this.findAccount(id);
    if (dto.name !== undefined) account.name = dto.name;
    if (dto.accountType !== undefined) account.accountType = dto.accountType;
    if (dto.bankName !== undefined) account.bankName = dto.bankName;
    if (dto.accountHolderName !== undefined)
      account.accountHolderName = dto.accountHolderName;
    if (dto.accountNumber !== undefined)
      account.accountNumber = dto.accountNumber;
    if (dto.isActive !== undefined) account.isActive = dto.isActive;
    return this.accountRepo.save(account);
  }

  /**
   * Ensures payment method matches ledger account (Cash till vs bank).
   */
  async assertPaymentAccount(
    paymentMethod: PaymentMethod,
    accountId: string,
    manager?: EntityManager,
  ): Promise<BankAccount> {
    const repo = manager
      ? manager.getRepository(BankAccount)
      : this.accountRepo;
    const account = await repo.findOne({
      where: { id: accountId, isActive: true },
    });
    if (!account) {
      throw new BadRequestException('Payment account not found');
    }

    if (
      paymentMethod === PaymentMethod.CASH &&
      account.accountType !== BankAccountType.CASH
    ) {
      throw new BadRequestException(
        'CASH payments must use a Cash account (accountType CASH), not a bank account',
      );
    }
    if (
      paymentMethod === PaymentMethod.BANK &&
      account.accountType !== BankAccountType.BANK
    ) {
      throw new BadRequestException(
        'BANK payments must use a bank account (accountType BANK), not the Cash till',
      );
    }

    return account;
  }

  findTransactions(query: BankTransactionsQueryDto) {
    const qb = this.txRepo
      .createQueryBuilder('tx')
      .leftJoinAndSelect('tx.bankAccount', 'bankAccount')
      .orderBy('tx.created_at', 'DESC');

    if (query.bankAccountId) {
      qb.andWhere('tx.bank_account_id = :bankAccountId', {
        bankAccountId: query.bankAccountId,
      });
    }
    if (query.type) {
      qb.andWhere('tx.type = :type', { type: query.type });
    }
    if (query.direction) {
      qb.andWhere('tx.direction = :direction', { direction: query.direction });
    }
    applyIlikeSearch(qb, query.search, ['tx.description']);
    applyDateRangeToQb(qb, 'tx.created_at', query.from, query.to);

    return paginatedQueryBuilder(qb, query.page, query.limit);
  }

  async manualAdjustment(
    bankAccountId: string,
    amount: number,
    direction: 'in' | 'out',
    description?: string,
    userId?: string,
  ) {
    return this.ledger.recordTransaction({
      bankAccountId,
      type: BankTransactionType.ADJUSTMENT,
      amount,
      direction,
      description,
      createdById: userId,
    });
  }
}
