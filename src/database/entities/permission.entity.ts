import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToMany,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from './role.entity';
import { UuidBaseEntity } from './uuid-base.entity';

@Entity('permissions')
export class Permission extends UuidBaseEntity {
  @Column({ unique: true, length: 100 })
  code: string;

  @Column({ length: 150 })
  name: string;

  @Column({ length: 80 })
  module: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @ManyToMany(() => Role, (role) => role.permissions)
  roles: Role[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
