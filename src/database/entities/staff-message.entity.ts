import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { User } from './user.entity';
import { UuidBaseEntity } from './uuid-base.entity';

@Entity('staff_messages')
@Index(['toUserId', 'readAt'])
@Index(['fromUserId', 'createdAt'])
@Index(['toUserId', 'createdAt'])
export class StaffMessage extends UuidBaseEntity {
  @Column({ name: 'from_user_id', type: 'uuid' })
  fromUserId: string;

  @Column({ name: 'to_user_id', type: 'uuid' })
  toUserId: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'from_user_id' })
  fromUser: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'to_user_id' })
  toUser: User;
}
