import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  UpdateDateColumn,
} from 'typeorm';
import {
  InquiryAssignmentStatus,
  InquiryPriority,
  InquirySource,
  InquiryStatus,
} from '../../common/enums';
import { Customer } from './customer.entity';
import { CustomerInquiryLine } from './customer-inquiry-line.entity';
import { Sale } from './sale.entity';
import { User } from './user.entity';
import { UuidBaseEntity } from './uuid-base.entity';

@Entity('customer_inquiries')
@Index(['status', 'createdAt'])
@Index(['source', 'createdAt'])
export class CustomerInquiry extends UuidBaseEntity {
  @Column({ name: 'contact_name', length: 150 })
  contactName: string;

  /** Organization / company (ERP-style inquiry header). */
  @Column({ name: 'company_name', type: 'varchar', length: 150, nullable: true })
  companyName: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email: string | null;

  @Column({ length: 200 })
  subject: string;

  @Column({ type: 'text' })
  message: string;

  @Column({
    type: 'enum',
    enum: InquiryStatus,
    default: InquiryStatus.DRAFT,
  })
  status: InquiryStatus;

  @Column({
    type: 'enum',
    enum: InquiryPriority,
    default: InquiryPriority.NORMAL,
  })
  priority: InquiryPriority;

  @Column({ type: 'enum', enum: InquirySource })
  source: InquirySource;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId: string | null;

  @Column({ name: 'assigned_to_user_id', type: 'uuid', nullable: true })
  assignedToUserId: string | null;

  @Column({
    name: 'assignment_status',
    type: 'enum',
    enum: InquiryAssignmentStatus,
    enumName: 'inquiry_assignment_status_enum',
    default: InquiryAssignmentStatus.UNASSIGNED,
  })
  assignmentStatus: InquiryAssignmentStatus;

  @Column({ name: 'assigned_at', type: 'timestamptz', nullable: true })
  assignedAt: Date | null;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @Column({ name: 'internal_notes', type: 'text', nullable: true })
  internalNotes: string | null;

  @Column({ name: 'follow_up_at', type: 'timestamptz', nullable: true })
  followUpAt: Date | null;

  /** Customer-needed-by / expected decision date (distinct from follow-up reminder). */
  @Column({ name: 'required_by_at', type: 'timestamptz', nullable: true })
  requiredByAt: Date | null;

  /** Quote expiry (when status is QUOTED). */
  @Column({ name: 'valid_until', type: 'timestamptz', nullable: true })
  validUntil: Date | null;

  /** When prices were first confirmed / marked quoted. */
  @Column({ name: 'quoted_at', type: 'timestamptz', nullable: true })
  quotedAt: Date | null;

  /** Sum of priced lines (qty × unitPrice). */
  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  subtotal: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  total: string | null;

  /** Customer-facing quote notes / terms. */
  @Column({ name: 'quote_terms', type: 'text', nullable: true })
  quoteTerms: string | null;

  /** Customer / external reference (PO number, their quote ref, etc.). */
  @Column({ type: 'varchar', length: 100, nullable: true })
  reference: string | null;

  @Column({ name: 'converted_sale_id', type: 'uuid', nullable: true })
  convertedSaleId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Customer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer | null;

  @OneToMany(() => CustomerInquiryLine, (line) => line.inquiry, {
    cascade: true,
  })
  lines: CustomerInquiryLine[];

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_to_user_id' })
  assignedTo: User | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User | null;

  @ManyToOne(() => Sale, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'converted_sale_id' })
  convertedSale: Sale | null;
}
