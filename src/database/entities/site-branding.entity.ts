import {
  Column,
  CreateDateColumn,
  Entity,
  UpdateDateColumn,
} from 'typeorm';
import { UuidBaseEntity } from './uuid-base.entity';

/** Singleton site branding (app name, hero, landing copy). */
@Entity('site_branding')
export class SiteBranding extends UuidBaseEntity {
  @Column({ name: 'app_name', length: 80, default: 'Stock' })
  appName: string;

  /** Relative path under the API host, e.g. `/uploads/branding/hero-….webp`. */
  @Column({ name: 'hero_image_path', type: 'varchar', length: 500, nullable: true })
  heroImagePath: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  headline: string | null;

  @Column({ name: 'supporting_text', type: 'varchar', length: 400, nullable: true })
  supportingText: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
