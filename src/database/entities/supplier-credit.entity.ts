import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  UpdateDateColumn,
} from 'typeorm';
import { CreditSource, CreditStatus } from '../../common/enums';
import { Purchase } from './purchase.entity';
import { Supplier } from './supplier.entity';
import { UuidBaseEntity } from './uuid-base.entity';

@Entity('supplier_credits')
export class SupplierCredit extends UuidBaseEntity {
  @Column({ name: 'supplier_id' })
  supplierId: string;

  @Column({ name: 'purchase_id', type: 'uuid', unique: true, nullable: true })
  purchaseId: string | null;

  @Column({
    type: 'enum',
    enum: CreditSource,
    enumName: 'credit_source_enum',
    default: CreditSource.PURCHASE,
  })
  source: CreditSource;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reference: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

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

  @ManyToOne(() => Supplier)
  @JoinColumn({ name: 'supplier_id' })
  supplier: Supplier;

  @OneToOne(() => Purchase, (purchase) => purchase.credit)
  @JoinColumn({ name: 'purchase_id' })
  purchase: Purchase | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
