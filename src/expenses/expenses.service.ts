import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BankTransactionType } from '../common/enums';
import {
  applyDateRangeToQb,
  applyRelatedIlikeSearch,
  paginatedQueryBuilder,
  sumFilteredQueryBuilder,
} from '../common/utils/query.util';
import { ExpenseListQueryDto } from './dto/expense-list-query.dto';
import { BankLedgerService } from '../banks/bank-ledger.service';
import { ExpenseCategory } from '../database/entities/expense-category.entity';
import { Expense } from '../database/entities/expense.entity';
import {
  CreateExpenseCategoryDto,
  CreateExpenseDto,
  UpdateExpenseDto,
} from './dto/expense.dto';

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(Expense)
    private readonly expenseRepo: Repository<Expense>,
    @InjectRepository(ExpenseCategory)
    private readonly categoryRepo: Repository<ExpenseCategory>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly bankLedger: BankLedgerService,
  ) {}

  findCategories() {
    return this.categoryRepo.find({ order: { name: 'ASC' } });
  }

  createCategory(dto: CreateExpenseCategoryDto) {
    return this.categoryRepo.save(this.categoryRepo.create(dto));
  }

  async findAll(query: ExpenseListQueryDto) {
    const filteredQb = this.buildExpenseFilterQb(query);
    const [totals, page] = await Promise.all([
      sumFilteredQueryBuilder(filteredQb, [
        { key: 'amount', sql: 'COALESCE(SUM(expense.amount::numeric), 0)' },
      ]),
      paginatedQueryBuilder(
        filteredQb
          .clone()
          .leftJoinAndSelect('expense.category', 'category')
          .leftJoinAndSelect('expense.bankAccount', 'bankAccount')
          .orderBy('expense.expense_date', 'DESC'),
        query.page,
        query.limit,
      ),
    ]);

    return { ...page, totals };
  }

  private buildExpenseFilterQb(query: ExpenseListQueryDto) {
    const qb = this.expenseRepo.createQueryBuilder('expense');

    if (query.categoryId) {
      qb.andWhere('expense.category_id = :categoryId', {
        categoryId: query.categoryId,
      });
    }
    if (query.bankAccountId) {
      qb.andWhere('expense.bank_account_id = :bankAccountId', {
        bankAccountId: query.bankAccountId,
      });
    }
    applyRelatedIlikeSearch(qb, query.search, ['expense.description'], {
      table: 'expense_categories',
      alias: 'category_filter',
      parentKey: 'expense.category_id',
      relatedKey: 'id',
      columns: ['name'],
    });
    applyDateRangeToQb(qb, 'expense.expense_date', query.from, query.to);

    return qb;
  }

  async create(dto: CreateExpenseDto, userId?: string) {
    const expenseId = await this.dataSource.transaction(async (manager) => {
      const expenseRepo = manager.getRepository(Expense);

      const expense = await expenseRepo.save(
        expenseRepo.create({
          categoryId: dto.categoryId,
          bankAccountId: dto.bankAccountId,
          amount: dto.amount.toFixed(2),
          description: dto.description ?? null,
          expenseDate: dto.expenseDate,
          createdById: userId ?? null,
        }),
      );

      await this.bankLedger.recordTransaction(
        {
          bankAccountId: dto.bankAccountId,
          type: BankTransactionType.EXPENSE,
          amount: dto.amount,
          direction: 'out',
          description: dto.description ?? `Expense ${expense.id}`,
          refType: 'expense',
          refId: expense.id,
          createdById: userId,
        },
        manager,
      );

      return expense.id;
    });

    return this.expenseRepo.findOne({
      where: { id: expenseId },
      relations: { category: true, bankAccount: true },
    });
  }

  async update(id: string, dto: UpdateExpenseDto) {
    const expense = await this.expenseRepo.findOne({ where: { id } });
    if (!expense) throw new NotFoundException('Expense not found');
    if (dto.description !== undefined) expense.description = dto.description;
    if (dto.categoryId !== undefined) expense.categoryId = dto.categoryId;
    return this.expenseRepo.save(expense);
  }

  async remove(id: string, userId?: string) {
    await this.dataSource.transaction(async (manager) => {
      const expenseRepo = manager.getRepository(Expense);
      const expense = await expenseRepo.findOne({ where: { id } });
      if (!expense) throw new NotFoundException('Expense not found');

      await this.bankLedger.reverseByReference(
        'expense',
        id,
        `Reversal of expense ${id}`,
        userId,
        manager,
      );

      await expenseRepo.remove(expense);
    });

    return { success: true };
  }
}
