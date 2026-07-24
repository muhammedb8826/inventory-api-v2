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

  /** Quantity of component required to make 1 finished unit. */
  @Column({ type: 'decimal', precision: 14, scale: 3 })
  quantity: string;

  @Column({
    name: 'scrap_percent',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
  })
  scrapPercent: string;

  @ManyToOne(() => Bom, (bom) => bom.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bom_id' })
  bom: Bom;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'component_item_id' })
  componentItem: Item;
}
