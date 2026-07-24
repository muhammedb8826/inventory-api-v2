import { ConfigService } from '@nestjs/config';

export interface AppCurrency {
  code: string;
  symbol: string;
}

export function getAppCurrency(config: ConfigService): AppCurrency {
  return {
    code: config.get<string>('app.currency', 'ETB'),
    symbol: config.get<string>('app.currencySymbol', 'Br'),
  };
}
