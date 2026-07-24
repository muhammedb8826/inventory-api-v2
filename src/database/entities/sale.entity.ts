import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  UpdateDateColumn,
} from 'typeorm';
import {
  DocumentStatus,
  PaymentMethod,
  CommissionBasis,
} from '../../common/enums';
import { BankAccount } from './bank-account.entity';
import { Customer } from './customer.entity';
import { CustomerCredit } from './customer-credit.entity';
import { Location } from './location.entity';
import { SaleLine } from './sale-line.entity';
import { User } from './user.entity';
import { UuidBaseEntity } from './uuid-base.entity';

@Entity('sales')
export class Sale extends UuidBaseEntity {
  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId: string | null;

  @Column({ name: 'location_id' })
  locationId: string;

  @Column({ type: 'enum', enum: PaymentMethod })
  paymentMethod: PaymentMethod;

  @Column({ name: 'bank_account_id', type: 'uuid', nullable: true })
  bankAccountId: string | null;

  @Column({ name: 'allow_negative_stock', default: false })
  allowNegativeStock: boolean;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  subtotal: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  total: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'stock_warnings', type: 'jsonb', nullable: true })
  stockWarnings: string[] | null;

  @Column({
    type: 'enum',
    enum: DocumentStatus,
    default: DocumentStatus.ACTIVE,
  })
  status: DocumentStatus;

  @Column({ name: 'voided_at', type: 'timestamptz', nullable: true })
  voidedAt: Date | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @Column({ name: 'sold_by_user_id', type: 'uuid', nullable: true })
  soldByUserId: string | null;

  @Column({
    name: 'commission_percent',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 10,
  })
  commissionPercent: string;

  @Column({
    name: 'commission_basis',
    type: 'enum',
    enum: CommissionBasis,
    enumName: 'sales_commission_basis_enum',
    default: CommissionBasis.PROFIT,
  })
  commissionBasis: CommissionBasis;

  @Column({
    name: 'commission_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  commissionAmount: string;

  @ManyToOne(() => Customer, (customer) => customer.sales)
  @JoinColumn({ name: 'customer_id' })
  customer: Customer | null;

  @ManyToOne(() => Location)
  @JoinColumn({ name: 'location_id' })
  location: Location;

  @ManyToOne(() => BankAccount)
  @JoinColumn({ name: 'bank_account_id' })
  bankAccount: BankAccount | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'sold_by_user_id' })
  soldByUser: User | null;

  @OneToMany(() => SaleLine, (line) => line.sale, {
    cascade: true,
    eager: true,
  })
  lines: SaleLine[];

  @OneToOne(() => CustomerCredit, (credit) => credit.sale)
  credit: CustomerCredit | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
