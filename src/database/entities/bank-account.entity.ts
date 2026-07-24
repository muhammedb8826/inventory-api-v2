import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  UpdateDateColumn,
} from 'typeorm';
import { BankAccountType } from '../../common/enums';
import { BankTransaction } from './bank-transaction.entity';
import { UuidBaseEntity } from './uuid-base.entity';

@Entity('bank_accounts')
export class BankAccount extends UuidBaseEntity {
  /** Short label for dropdowns (e.g. "Main Bank", "Cash"). */
  @Column({ length: 120 })
  name: string;

  /** Financial institution / provider (e.g. "Commercial Bank of Ethiopia"). */
  @Column({ name: 'bank_name', type: 'varchar', length: 120, nullable: true })
  bankName: string | null;

  /** Name on the account (business or person). */
  @Column({
    name: 'account_holder_name',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  accountHolderName: string | null;

  @Column({
    name: 'account_number',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  accountNumber: string | null;

  @Column({
    name: 'account_type',
    type: 'enum',
    enum: BankAccountType,
    default: BankAccountType.BANK,
  })
  accountType: BankAccountType;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  balance: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @OneToMany(() => BankTransaction, (tx) => tx.bankAccount)
  transactions: BankTransaction[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
