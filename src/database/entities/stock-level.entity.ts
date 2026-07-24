import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Item } from './item.entity';
import { Location } from './location.entity';
import { UuidBaseEntity } from './uuid-base.entity';

@Entity('stock_levels')
@Unique(['locationId', 'itemId'])
export class StockLevel extends UuidBaseEntity {
  @Column({ name: 'location_id' })
  locationId: string;

  @Column({ name: 'item_id' })
  itemId: string;

  @Column({ type: 'decimal', precision: 14, scale: 3, default: 0 })
  quantity: string;

  @Column({
    name: 'purchase_price',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  purchasePrice: string;

  /** Alert when quantity falls to or below this level (per location). Null = no alert. */
  @Column({
    name: 'reorder_point',
    type: 'decimal',
    precision: 14,
    scale: 3,
    nullable: true,
  })
  reorderPoint: string | null;

  @ManyToOne(() => Location, (location) => location.stockLevels)
  @JoinColumn({ name: 'location_id' })
  location: Location;

  @ManyToOne(() => Item, (item) => item.stockLevels, { eager: true })
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
