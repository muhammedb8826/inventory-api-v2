import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { UuidBaseEntity } from './uuid-base.entity';
import { Item } from './item.entity';
import { Uom } from './uom.entity';

/**
 * Item-specific UOM (ERPNext-style).
 * `conversionFactor` = how many **stock UOM** units equal 1 of this UOM for this item.
 * Overrides category math when present (e.g. Item A: 1 Box = 24 Pcs).
 */
@Entity('item_uoms')
@Unique(['itemId', 'uomId'])
export class ItemUom extends UuidBaseEntity {
  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({ name: 'uom_id', type: 'uuid' })
  uomId: string;

  @Column({
    name: 'conversion_factor',
    type: 'decimal',
    precision: 18,
    scale: 9,
  })
  conversionFactor: string;

  @ManyToOne(() => Item, (item) => item.itemUoms, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @ManyToOne(() => Uom, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'uom_id' })
  uom: Uom;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
