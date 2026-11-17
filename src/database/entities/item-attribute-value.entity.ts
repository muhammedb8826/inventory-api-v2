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
import { ProductAttributeValue } from './product-attribute-value.entity';

/** Links an item to selected attribute values (Color=Red, Size=L, …). */
@Entity('item_attribute_values')
@Unique(['itemId', 'attributeValueId'])
export class ItemAttributeValue extends UuidBaseEntity {
  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({ name: 'attribute_value_id', type: 'uuid' })
  attributeValueId: string;

  @ManyToOne(() => Item, (item) => item.itemAttributeValues, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @ManyToOne(() => ProductAttributeValue, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attribute_value_id' })
  attributeValue: ProductAttributeValue;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
