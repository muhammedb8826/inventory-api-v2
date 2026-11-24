import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommissionSettings } from '../database/entities/commission-settings.entity';
import { SiteBranding } from '../database/entities/site-branding.entity';
import { TaxSettings } from '../database/entities/tax-settings.entity';
import { PublicBrandingController } from './public-branding.controller';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SiteBranding, CommissionSettings, TaxSettings]),
  ],
  controllers: [SettingsController, PublicBrandingController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
