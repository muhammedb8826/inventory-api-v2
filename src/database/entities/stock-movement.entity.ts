import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { StockMovementRefType } from '../../common/enums';
import { Item } from './item.entity';
import { Location } from './location.entity';
import { User } from './user.entity';
import { UuidBaseEntity } from './uuid-base.entity';

@Entity('stock_movements')
@Index(['itemId', 'createdAt'])
@Index(['locationId', 'createdAt'])
@Index(['refType', 'refId'])
export class StockMovement extends UuidBaseEntity {
  @Column({ name: 'location_id', type: 'uuid' })
  locationId: string;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  /** Signed quantity change in stock UOM (negative = out). */
  @Column({
    name: 'quantity_delta',
    type: 'decimal',
    precision: 14,
    scale: 3,
  })
  quantityDelta: string;

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
    name: 'ref_type',
    type: 'enum',
    enum: StockMovementRefType,
    enumName: 'stock_movements_ref_type_enum',
    nullable: true,
  })
  refType: StockMovementRefType | null;

  @Column({ name: 'ref_id', type: 'uuid', nullable: true })
  refId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

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
