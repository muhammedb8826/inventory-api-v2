import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Item } from './item.entity';
import { Sale } from './sale.entity';
import { Uom } from './uom.entity';
import { UuidBaseEntity } from './uuid-base.entity';

@Entity('sale_lines')
export class SaleLine extends UuidBaseEntity {
  @Column({ name: 'sale_id' })
  saleId: string;

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

  @Column({ name: 'purchase_cost', type: 'decimal', precision: 14, scale: 2 })
  purchaseCost: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  lineTotal: string;

  @ManyToOne(() => Sale, (sale) => sale.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  @ManyToOne(() => Item, { eager: true })
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @ManyToOne(() => Uom, { nullable: true, eager: true })
  @JoinColumn({ name: 'uom_id' })
  uom: Uom | null;
}
