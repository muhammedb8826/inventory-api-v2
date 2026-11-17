import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { Item } from './item.entity';
import { Sale } from './sale.entity';
import { SaleLineComponent } from './sale-line-component.entity';
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

  @ManyToOne(() => Sale, (sale) => sale.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  @ManyToOne(() => Item, { eager: true })
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @ManyToOne(() => Uom, { nullable: true, eager: true })
  @JoinColumn({ name: 'uom_id' })
  uom: Uom | null;

  /** Kit component snapshot when this line sold a Kit BoM product. */
  @OneToMany(() => SaleLineComponent, (c) => c.saleLine, { cascade: true })
  components?: SaleLineComponent[];
}
