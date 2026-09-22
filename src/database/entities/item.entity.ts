import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  UpdateDateColumn,
} from 'typeorm';
import { ItemType } from '../../common/enums';
import { StockLevel } from './stock-level.entity';
import { UuidBaseEntity } from './uuid-base.entity';

@Entity('items')
export class Item extends UuidBaseEntity {
  @Column({ type: 'varchar', length: 80, nullable: true })
  sku: string | null;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  unit: string | null;

  @Column({
    name: 'item_type',
    type: 'enum',
    enum: ItemType,
    enumName: 'items_item_type_enum',
    default: ItemType.OTHER,
  })
  itemType: ItemType;

  /** Relative path e.g. `/uploads/items/item-….webp`. */
  @Column({ name: 'image_path', type: 'varchar', length: 500, nullable: true })
  imagePath: string | null;

  /** Absolute (or relative) URL for API clients — set in service, not persisted. */
  imageUrl?: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @OneToMany(() => StockLevel, (stock) => stock.item)
  stockLevels: StockLevel[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
