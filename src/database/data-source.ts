import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { entities } from './entities';

dotenv.config({ path: path.join(process.cwd(), '.env') });

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME,
  password: String(process.env.DB_PASSWORD),
  database: process.env.DB_DATABASE,
  entities,
  // When using TypeORM migrations, keep this false.
  synchronize: false,
  migrations: [path.join(__dirname, 'migrations', '*.{ts,js}')],
});
