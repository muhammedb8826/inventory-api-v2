import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TaxMode } from '../../common/enums';

export const TAX_SETTINGS_ID = 'default';

/** Company-wide tax plan (singleton). */
@Entity('tax_settings')
export class TaxSettings {
  @PrimaryColumn({
    type: 'varchar',
    length: 32,
    default: TAX_SETTINGS_ID,
  })
  id: string;

  /** Master switch — when false, documents store 0 tax. */
  @Column({ default: false })
  enabled: boolean;

  @Column({
    name: 'default_percent',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
  })
  defaultPercent: string;

  @Column({
    name: 'default_mode',
    type: 'enum',
    enum: TaxMode,
    enumName: 'tax_mode_enum',
    default: TaxMode.EXCLUSIVE,
  })
  defaultMode: TaxMode;

  @Column({ name: 'apply_to_sales', default: true })
  applyToSales: boolean;

  @Column({ name: 'apply_to_purchases', default: true })
  applyToPurchases: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
