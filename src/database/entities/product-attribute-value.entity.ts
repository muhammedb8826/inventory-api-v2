import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  UpdateDateColumn,
} from 'typeorm';
import { UuidBaseEntity } from './uuid-base.entity';
import { ProductAttribute } from './product-attribute.entity';

/** A value under an attribute (Red, XL, 2XL, Cotton, …). */
@Entity('product_attribute_values')
export class ProductAttributeValue extends UuidBaseEntity {
  @Column({ name: 'attribute_id', type: 'uuid' })
  attributeId: string;

  @Column({ type: 'varchar', length: 40 })
  code: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  /** Optional hex for color swatches (#FF0000). */
  @Column({ name: 'color_hex', type: 'varchar', length: 7, nullable: true })
  colorHex: string | null;

  @Column({ name: 'sequence', type: 'int', default: 10 })
  sequence: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @ManyToOne(() => ProductAttribute, (a) => a.values, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attribute_id' })
  attribute: ProductAttribute;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
