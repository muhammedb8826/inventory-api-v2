import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Item } from './item.entity';
import { Purchase } from './purchase.entity';
import { Uom } from './uom.entity';
import { UuidBaseEntity } from './uuid-base.entity';

@Entity('purchase_lines')
export class PurchaseLine extends UuidBaseEntity {
  @Column({ name: 'purchase_id' })
  purchaseId: string;

  @Column({ name: 'item_id' })
  itemId: string;

  /** Quantity in `uomId` (transaction UOM). */
  @Column({ type: 'decimal', precision: 14, scale: 3 })
  quantity: string;

  @Column({ name: 'uom_id', type: 'uuid', nullable: true })
  uomId: string | null;

  /** Quantity converted to the item's stock UOM (used for inventory). */
  @Column({
    name: 'stock_quantity',
    type: 'decimal',
    precision: 14,
    scale: 3,
    nullable: true,
  })
  stockQuantity: string | null;

  @Column({ name: 'unit_price', type: 'decimal', precision: 14, scale: 2 })
  unitPrice: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  lineTotal: string;

  /** Cut width. Null = roll / plain qty line. */
  @Column({
    name: 'dim_width',
    type: 'decimal',
    precision: 18,
    scale: 9,
    nullable: true,
  })
  dimWidth: string | null;

  @Column({
    name: 'dim_height',
    type: 'decimal',
    precision: 18,
    scale: 9,
    nullable: true,
  })
  dimHeight: string | null;

  @Column({
    name: 'dim_pieces',
    type: 'decimal',
    precision: 14,
    scale: 3,
    nullable: true,
  })
  dimPieces: string | null;

  @ManyToOne(() => Purchase, (purchase) => purchase.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'purchase_id' })
  purchase: Purchase;

  @ManyToOne(() => Item, { eager: true })
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @ManyToOne(() => Uom, { nullable: true, eager: true })
  @JoinColumn({ name: 'uom_id' })
  uom: Uom | null;
}
