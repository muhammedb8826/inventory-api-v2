import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import {
  BankTransactionDirection,
  BankTransactionType,
} from '../../common/enums';
import { BankAccount } from './bank-account.entity';
import { User } from './user.entity';
import { UuidBaseEntity } from './uuid-base.entity';

@Entity('bank_transactions')
export class BankTransaction extends UuidBaseEntity {
  @Column({ name: 'bank_account_id' })
  bankAccountId: string;

  @Column({ type: 'enum', enum: BankTransactionType })
  type: BankTransactionType;

  @Column({
    type: 'enum',
    enum: BankTransactionDirection,
    enumName: 'bank_transactions_direction_enum',
  })
  direction: BankTransactionDirection;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: string;

  @Column({ name: 'balance_after', type: 'decimal', precision: 14, scale: 2 })
  balanceAfter: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'reference_type',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  refType: string | null;

  @Column({ name: 'reference_id', type: 'uuid', nullable: true })
  refId: string | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @ManyToOne(() => BankAccount, (account) => account.transactions)
  @JoinColumn({ name: 'bank_account_id' })
  bankAccount: BankAccount;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
