import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SeedService } from './database/seed.service';

dotenv.config();

async function seed() {
  // Prevent SeedService.onModuleInit auto-run from triggering twice when DB_SEED=true.
  process.env.DB_SEED = 'false';

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    // SeedService already respects DB_SEED=true when the API boots.
    // This script lets you run it manually (e.g. on deploy) without relying on app startup.
    const seeder = app.get(SeedService);
    await seeder.seed();
  } finally {
    await app.close();
  }
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
