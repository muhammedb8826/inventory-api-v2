import { randomUUID } from 'crypto';
import { BeforeInsert, PrimaryColumn } from 'typeorm';

/**
 * Application-generated UUID primary key.
 * Avoids requiring Postgres extensions (uuid-ossp/pgcrypto) on hosts like cPanel.
 */
export abstract class UuidBaseEntity {
  @PrimaryColumn('uuid')
  id: string;

  @BeforeInsert()
  private assignUuid() {
    if (!this.id) this.id = randomUUID();
  }
}
