import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { BankTransactionDirection, BankTransactionType } from '../common/enums';
import { BankAccount } from '../database/entities/bank-account.entity';
import { BankTransaction } from '../database/entities/bank-transaction.entity';

export interface RecordTransactionParams {
  bankAccountId: string;
  type: BankTransactionType;
  amount: number;
  description?: string;
  refType?: string;
  refId?: string;
  createdById?: string;
  direction: BankTransactionDirection | 'in' | 'out';
}

@Injectable()
export class BankLedgerService {
  constructor(
    @InjectRepository(BankAccount)
    private readonly accountRepo: Repository<BankAccount>,
    @InjectRepository(BankTransaction)
    private readonly txRepo: Repository<BankTransaction>,
  ) {}

  private repos(manager?: EntityManager) {
    return {
      account: manager ? manager.getRepository(BankAccount) : this.accountRepo,
      tx: manager ? manager.getRepository(BankTransaction) : this.txRepo,
    };
  }

  async recordTransaction(
    params: RecordTransactionParams,
    manager?: EntityManager,
  ): Promise<BankTransaction> {
    const { account, tx } = this.repos(manager);

    const row = await account.findOne({
      where: { id: params.bankAccountId, isActive: true },
    });
    if (!row) throw new BadRequestException('Bank account not found');

    const direction =
      params.direction === BankTransactionDirection.IN ||
      (params.direction as string) === 'in'
        ? BankTransactionDirection.IN
        : BankTransactionDirection.OUT;

    const signed =
      direction === BankTransactionDirection.IN
        ? Math.abs(params.amount)
        : -Math.abs(params.amount);

    const newBalance = parseFloat(row.balance) + signed;
    row.balance = newBalance.toFixed(2);
    await account.save(row);

    return tx.save(
      tx.create({
        bankAccountId: params.bankAccountId,
        type: params.type,
        direction,
        amount: Math.abs(params.amount).toFixed(2),
        balanceAfter: newBalance.toFixed(2),
        description: params.description ?? null,
        refType: params.refType ?? null,
        refId: params.refId ?? null,
        createdById: params.createdById ?? null,
      }),
    );
  }

  async reverseByReference(
    refType: string,
    refId: string,
    description: string,
    createdById?: string,
    manager?: EntityManager,
  ) {
    const { tx } = this.repos(manager);
    const original = await tx.findOne({
      where: { refType, refId },
      order: { createdAt: 'DESC' },
    });
    if (!original) return null;

    const amount = parseFloat(original.amount);
    const direction =
      original.type === BankTransactionType.SALE ||
      original.type === BankTransactionType.CREDIT_RECEIPT
        ? BankTransactionDirection.OUT
        : BankTransactionDirection.IN;

    return this.recordTransaction(
      {
        bankAccountId: original.bankAccountId,
        type: BankTransactionType.ADJUSTMENT,
        amount,
        direction,
        description,
        refType: `${refType}_reversal`,
        refId,
        createdById,
      },
      manager,
    );
  }
}
