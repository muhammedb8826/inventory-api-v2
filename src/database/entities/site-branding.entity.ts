import { Column, CreateDateColumn, Entity, UpdateDateColumn } from 'typeorm';
import { UuidBaseEntity } from './uuid-base.entity';

/** Singleton company branding + document template settings. */
@Entity('site_branding')
export class SiteBranding extends UuidBaseEntity {
  @Column({ name: 'app_name', length: 80, default: 'Stock' })
  appName: string;

  /** @deprecated Prefer logoLightPath — kept for older uploads. */
  @Column({
    name: 'hero_image_path',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  heroImagePath: string | null;

  /** Logo for light UI / printed papers (prefer PNG). */
  @Column({
    name: 'logo_light_path',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  logoLightPath: string | null;

  /** Logo for dark UI (prefer PNG). Falls back to light logo. */
  @Column({
    name: 'logo_dark_path',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  logoDarkPath: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  headline: string | null;

  @Column({
    name: 'supporting_text',
    type: 'varchar',
    length: 400,
    nullable: true,
  })
  supportingText: string | null;

  @Column({ name: 'legal_name', type: 'varchar', length: 160, nullable: true })
  legalName: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  tagline: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  website: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  address: string | null;

  @Column({ name: 'tax_id', type: 'varchar', length: 64, nullable: true })
  taxId: string | null;

  @Column({
    name: 'registration_number',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  registrationNumber: string | null;

  /** Short line under company name on invoices (e.g. "Tax Invoice"). */
  @Column({
    name: 'invoice_header_text',
    type: 'varchar',
    length: 400,
    nullable: true,
  })
  invoiceHeaderText: string | null;

  /** Footer / thank-you line on invoices. */
  @Column({ name: 'invoice_footer_text', type: 'text', nullable: true })
  invoiceFooterText: string | null;

  @Column({ name: 'terms_and_conditions', type: 'text', nullable: true })
  termsAndConditions: string | null;

  /** Bank / payment instructions printed on invoices. */
  @Column({ name: 'bank_details', type: 'text', nullable: true })
  bankDetails: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
