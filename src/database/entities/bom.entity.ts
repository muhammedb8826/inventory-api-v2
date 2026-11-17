import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  UpdateDateColumn,
} from 'typeorm';
import { BomType } from '../../common/enums';
import { Item } from './item.entity';
import { BomLine } from './bom-line.entity';
import { UuidBaseEntity } from './uuid-base.entity';

@Entity('boms')
export class Bom extends UuidBaseEntity {
  /** Product (template or standalone). */
  @Column({ name: 'finished_item_id', type: 'uuid' })
  finishedItemId: string;

  /**
   * Optional product variant. Null = BoM applies to the product
   * (all variants / standalone item).
   */
  @Column({ name: 'variant_item_id', type: 'uuid', nullable: true })
  variantItemId: string | null;

  /** Odoo "Reference" — internal BoM label (not the product name). */
  @Column({ length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  version: string | null;

  /** Quantity of finished product this BoM produces (default 1). */
  @Column({ type: 'decimal', precision: 14, scale: 3, default: 1 })
  quantity: string;

  @Column({
    name: 'bom_type',
    type: 'enum',
    enum: BomType,
    enumName: 'boms_bom_type_enum',
    default: BomType.MANUFACTURE,
  })
  bomType: BomType;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'finished_item_id' })
  finishedItem: Item;

  @ManyToOne(() => Item, { nullable: true })
  @JoinColumn({ name: 'variant_item_id' })
  variantItem: Item | null;

  @OneToMany(() => BomLine, (line) => line.bom, { cascade: true })
  lines: BomLine[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
