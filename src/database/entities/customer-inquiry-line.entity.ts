import {
  BeforeInsert,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { randomUUID } from 'crypto';
import { Item } from './item.entity';
import { CustomerInquiry } from './customer-inquiry.entity';

@Entity('customer_inquiry_lines')
export class CustomerInquiryLine {
  @PrimaryColumn('uuid')
  id: string;

  @BeforeInsert()
  assignUuid() {
    if (!this.id) this.id = randomUUID();
  }

  @Column({ name: 'inquiry_id', type: 'uuid' })
  inquiryId: string;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  /** Requested quantity (optional interest qty). */
  @Column({ type: 'decimal', precision: 14, scale: 3, nullable: true })
  quantity: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @ManyToOne(() => CustomerInquiry, (inquiry) => inquiry.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'inquiry_id' })
  inquiry: CustomerInquiry;

  @ManyToOne(() => Item, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'item_id' })
  item: Item;
}
