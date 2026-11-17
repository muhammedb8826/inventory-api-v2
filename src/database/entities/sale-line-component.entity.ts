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
import { SaleLine } from './sale-line.entity';

/**
 * Snapshot of kit components deducted when a kit sale line was posted.
 * Used so void/update restore the same quantities even if the BoM changes later.
 */
@Entity('sale_line_components')
export class SaleLineComponent {
  @PrimaryColumn('uuid')
  id: string;

  @BeforeInsert()
  assignUuid() {
    if (!this.id) this.id = randomUUID();
  }

  @Column({ name: 'sale_line_id', type: 'uuid' })
  saleLineId: string;

  @Column({ name: 'component_item_id', type: 'uuid' })
  componentItemId: string;

  /** Quantity deducted in the component's stock UOM. */
  @Column({
    name: 'stock_quantity',
    type: 'decimal',
    precision: 14,
    scale: 3,
  })
  stockQuantity: string;

  @ManyToOne(() => SaleLine, (line) => line.components, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sale_line_id' })
  saleLine: SaleLine;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'component_item_id' })
  componentItem: Item;
}
