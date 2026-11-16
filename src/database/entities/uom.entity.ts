import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  UpdateDateColumn,
} from 'typeorm';
import { UuidBaseEntity } from './uuid-base.entity';
import { UomCategory } from './uom-category.entity';

/**
 * Unit of measure. `conversionFactor` = how many **category base** units equal 1 of this UOM.
 * Example (COUNT, base Pcs): Pcs=1, Pack=12 → 1 Pack = 12 Pcs.
 * Example (LENGTH, base m): m=1, cm=0.01 → 1 cm = 0.01 m.
 */
@Entity('uoms')
export class Uom extends UuidBaseEntity {
  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @Column({ type: 'varchar', length: 40, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  /** Short label for documents (pcs, m, sqm). */
  @Column({ type: 'varchar', length: 20 })
  symbol: string;

  /**
   * Multiplier to the category base unit.
   * qty_in_base = qty_in_this_uom * conversionFactor
   */
  @Column({
    name: 'conversion_factor',
    type: 'decimal',
    precision: 18,
    scale: 9,
    default: 1,
  })
  conversionFactor: string;

  /** Exactly one base UOM per category (factor should be 1). */
  @Column({ name: 'is_base', default: false })
  isBase: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @ManyToOne(() => UomCategory, (c) => c.uoms, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'category_id' })
  category: UomCategory;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
