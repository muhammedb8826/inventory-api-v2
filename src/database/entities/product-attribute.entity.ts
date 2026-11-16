import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  UpdateDateColumn,
} from 'typeorm';
import { UuidBaseEntity } from './uuid-base.entity';
import { ProductAttributeValue } from './product-attribute-value.entity';

/**
 * Product attribute master (Color, Size, Material, …).
 * Values live on `product_attribute_values`; variants come later via item links.
 */
@Entity('product_attributes')
export class ProductAttribute extends UuidBaseEntity {
  @Column({ type: 'varchar', length: 40, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Display hint: select | radio | color */
  @Column({ name: 'display_type', type: 'varchar', length: 20, default: 'select' })
  displayType: string;

  @Column({ name: 'sequence', type: 'int', default: 10 })
  sequence: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @OneToMany(() => ProductAttributeValue, (v) => v.attribute)
  values: ProductAttributeValue[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
