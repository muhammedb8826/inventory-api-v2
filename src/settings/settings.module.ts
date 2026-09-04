import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SiteBranding } from '../database/entities/site-branding.entity';
import { PublicBrandingController } from './public-branding.controller';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [TypeOrmModule.forFeature([SiteBranding])],
  controllers: [SettingsController, PublicBrandingController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
