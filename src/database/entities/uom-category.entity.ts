import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  UpdateDateColumn,
} from 'typeorm';
import { UuidBaseEntity } from './uuid-base.entity';
import { Uom } from './uom.entity';

/**
 * Groups units that convert among themselves (COUNT, LENGTH, AREA, MASS, VOLUME).
 * Cross-category conversion (e.g. Length → Area) uses item `uomWidth`.
 */
@Entity('uom_categories')
export class UomCategory extends UuidBaseEntity {
  @Column({ type: 'varchar', length: 40, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  /**
   * When true, items stocked in this category may set a constant roll width
   * and use W×H / Length→Area conversion. When false, width/height stay hidden.
   */
  @Column({ name: 'has_constant_width', default: false })
  hasConstantWidth: boolean;

  @OneToMany(() => Uom, (uom) => uom.category)
  uoms: Uom[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
