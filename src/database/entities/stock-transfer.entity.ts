import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  UpdateDateColumn,
} from 'typeorm';
import { TransferStatus } from '../../common/enums';
import { Location } from './location.entity';
import { StockTransferLine } from './stock-transfer-line.entity';
import { User } from './user.entity';
import { UuidBaseEntity } from './uuid-base.entity';

@Entity('stock_transfers')
export class StockTransfer extends UuidBaseEntity {
  @Column({ name: 'from_location_id' })
  fromLocationId: string;

  @Column({ name: 'to_location_id' })
  toLocationId: string;

  @Column({
    type: 'enum',
    enum: TransferStatus,
    default: TransferStatus.PENDING,
  })
  status: TransferStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @ManyToOne(() => Location)
  @JoinColumn({ name: 'from_location_id' })
  fromLocation: Location;

  @ManyToOne(() => Location)
  @JoinColumn({ name: 'to_location_id' })
  toLocation: Location;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User | null;

  @OneToMany(() => StockTransferLine, (line) => line.transfer, {
    cascade: true,
    eager: true,
  })
  lines: StockTransferLine[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
