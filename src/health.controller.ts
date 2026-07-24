import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getAppCurrency } from './common/utils/currency.util';

@Controller()
export class HealthController {
  constructor(private readonly config: ConfigService) {}

  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'inventory-api',
      currency: getAppCurrency(this.config),
    };
  }
}
