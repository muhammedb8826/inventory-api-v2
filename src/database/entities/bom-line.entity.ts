import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  BeforeInsert,
} from 'typeorm';
import { randomUUID } from 'crypto';
import { Item } from './item.entity';
import { Bom } from './bom.entity';
import { Uom } from './uom.entity';

@Entity('bom_lines')
export class BomLine {
  @PrimaryColumn('uuid')
  id: string;

  @BeforeInsert()
  assignUuid() {
    if (!this.id) this.id = randomUUID();
  }

  @Column({ name: 'bom_id', type: 'uuid' })
  bomId: string;

  @Column({ name: 'component_item_id', type: 'uuid' })
  componentItemId: string;

  /** Quantity of component (in `uomId`) required to make 1 finished unit. */
  @Column({ type: 'decimal', precision: 14, scale: 3 })
  quantity: string;

  @Column({ name: 'uom_id', type: 'uuid', nullable: true })
  uomId: string | null;

  /** Quantity in the component item's stock UOM (after conversion + scrap). */
  @Column({
    name: 'stock_quantity',
    type: 'decimal',
    precision: 14,
    scale: 3,
    nullable: true,
  })
  stockQuantity: string | null;

  @Column({
    name: 'scrap_percent',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
  })
  scrapPercent: string;

  /** Cut width. Null = plain qty line. */
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

  /** Length UOM for dimWidth/dimHeight (m/cm/mm). Null = meters. */
  @Column({ name: 'dim_uom_id', type: 'uuid', nullable: true })
  dimUomId: string | null;

  @ManyToOne(() => Bom, (bom) => bom.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bom_id' })
  bom: Bom;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'component_item_id' })
  componentItem: Item;

  @ManyToOne(() => Uom, { nullable: true })
  @JoinColumn({ name: 'uom_id' })
  uom: Uom | null;

  @ManyToOne(() => Uom, { nullable: true })
  @JoinColumn({ name: 'dim_uom_id' })
  dimUom: Uom | null;
}
