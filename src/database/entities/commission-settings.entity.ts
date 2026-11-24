import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CommissionBasis } from '../../common/enums';

export const COMMISSION_SETTINGS_ID = 'default';

/** Company-wide commission plan (singleton). */
@Entity('commission_settings')
export class CommissionSettings {
  @PrimaryColumn({
    type: 'varchar',
    length: 32,
    default: COMMISSION_SETTINGS_ID,
  })
  id: string;

  /** Master switch — when false, sales store 0 commission. */
  @Column({ default: true })
  enabled: boolean;

  @Column({
    name: 'default_percent',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 10,
  })
  defaultPercent: string;

  @Column({
    name: 'default_basis',
    type: 'enum',
    enum: CommissionBasis,
    enumName: 'sales_commission_basis_enum',
    default: CommissionBasis.PROFIT,
  })
  defaultBasis: CommissionBasis;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
