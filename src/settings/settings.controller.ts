import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request } from 'express';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { UpdateBrandingDto } from './dto/branding.dto';
import { SettingsService } from './settings.service';

function requestBaseUrl(req: Request) {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const host = req.get('host');
  return host ? `${proto}://${host}` : undefined;
}

@Controller('settings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('branding')
  @RequirePermissions('settings.read')
  getBranding(@Req() req: Request) {
    return this.settings.getBranding(requestBaseUrl(req));
  }

  @Patch('branding')
  @RequirePermissions('settings.write')
  updateBranding(@Req() req: Request, @Body() dto: UpdateBrandingDto) {
    return this.settings.updateBranding(dto, requestBaseUrl(req));
  }

  @Post('branding/hero-image')
  @RequirePermissions('settings.write')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadHero(
    @Req() req: Request,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.settings.uploadHeroImage(file, requestBaseUrl(req));
  }

  @Delete('branding/hero-image')
  @RequirePermissions('settings.write')
  clearHero(@Req() req: Request) {
    return this.settings.clearHeroImage(requestBaseUrl(req));
  }
}
