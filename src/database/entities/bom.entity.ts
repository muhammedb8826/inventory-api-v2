import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  UpdateDateColumn,
} from 'typeorm';
import { Item } from './item.entity';
import { BomLine } from './bom-line.entity';
import { UuidBaseEntity } from './uuid-base.entity';

@Entity('boms')
export class Bom extends UuidBaseEntity {
  @Column({ name: 'finished_item_id', type: 'uuid' })
  finishedItemId: string;

  @Column({ length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  version: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'finished_item_id' })
  finishedItem: Item;

  @OneToMany(() => BomLine, (line) => line.bom, { cascade: true })
  lines: BomLine[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
