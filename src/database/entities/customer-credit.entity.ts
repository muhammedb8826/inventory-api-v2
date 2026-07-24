import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  UpdateDateColumn,
} from 'typeorm';
import { CreditStatus } from '../../common/enums';
import { Customer } from './customer.entity';
import { Sale } from './sale.entity';
import { UuidBaseEntity } from './uuid-base.entity';

@Entity('customer_credits')
export class CustomerCredit extends UuidBaseEntity {
  @Column({ name: 'customer_id' })
  customerId: string;

  @Column({ name: 'sale_id', unique: true })
  saleId: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: string;

  @Column({
    name: 'paid_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  paidAmount: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  balance: string;

  @Column({ type: 'enum', enum: CreditStatus, default: CreditStatus.OPEN })
  status: CreditStatus;

  @Column({ type: 'date', nullable: true })
  dueDate: string | null;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @OneToOne(() => Sale, (sale) => sale.credit)
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
