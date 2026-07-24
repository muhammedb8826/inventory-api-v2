import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Item } from './item.entity';
import { Purchase } from './purchase.entity';
import { UuidBaseEntity } from './uuid-base.entity';

@Entity('purchase_lines')
export class PurchaseLine extends UuidBaseEntity {
  @Column({ name: 'purchase_id' })
  purchaseId: string;

  @Column({ name: 'item_id' })
  itemId: string;

  @Column({ type: 'decimal', precision: 14, scale: 3 })
  quantity: string;

  @Column({ name: 'unit_price', type: 'decimal', precision: 14, scale: 2 })
  unitPrice: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  lineTotal: string;

  @ManyToOne(() => Purchase, (purchase) => purchase.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'purchase_id' })
  purchase: Purchase;

  @ManyToOne(() => Item, { eager: true })
  @JoinColumn({ name: 'item_id' })
  item: Item;
}
