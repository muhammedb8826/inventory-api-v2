import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import {
  StockAdjustmentDirection,
  StockAdjustmentReason,
} from '../../common/enums';
import { Item } from './item.entity';
import { Location } from './location.entity';
import { User } from './user.entity';
import { UuidBaseEntity } from './uuid-base.entity';

@Entity('stock_adjustments')
@Index(['locationId', 'createdAt'])
@Index(['itemId', 'createdAt'])
export class StockAdjustment extends UuidBaseEntity {
  @Column({ name: 'location_id', type: 'uuid' })
  locationId: string;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({
    type: 'enum',
    enum: StockAdjustmentDirection,
    enumName: 'stock_adjustments_direction_enum',
  })
  direction: StockAdjustmentDirection;

  @Column({ type: 'decimal', precision: 14, scale: 3 })
  quantity: string;

  @Column({
    name: 'quantity_before',
    type: 'decimal',
    precision: 14,
    scale: 3,
  })
  quantityBefore: string;

  @Column({
    name: 'quantity_after',
    type: 'decimal',
    precision: 14,
    scale: 3,
  })
  quantityAfter: string;

  @Column({
    type: 'enum',
    enum: StockAdjustmentReason,
    enumName: 'stock_adjustments_reason_enum',
  })
  reason: StockAdjustmentReason;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reference: string | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @ManyToOne(() => Location)
  @JoinColumn({ name: 'location_id' })
  location: Location;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
