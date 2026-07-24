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
import { ProductionOrder } from './production-order.entity';

@Entity('production_order_lines')
export class ProductionOrderLine {
  @PrimaryColumn('uuid')
  id: string;

  @BeforeInsert()
  assignUuid() {
    if (!this.id) this.id = randomUUID();
  }

  @Column({ name: 'production_order_id', type: 'uuid' })
  productionOrderId: string;

  @Column({ name: 'component_item_id', type: 'uuid' })
  componentItemId: string;

  @Column({
    name: 'quantity_required',
    type: 'decimal',
    precision: 14,
    scale: 3,
  })
  quantityRequired: string;

  @Column({
    name: 'quantity_issued',
    type: 'decimal',
    precision: 14,
    scale: 3,
    default: 0,
  })
  quantityIssued: string;

  @ManyToOne(() => ProductionOrder, (order) => order.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'production_order_id' })
  productionOrder: ProductionOrder;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'component_item_id' })
  componentItem: Item;
}
