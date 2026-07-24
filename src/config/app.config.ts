import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  currency: process.env.CURRENCY ?? 'ETB',
  currencySymbol: process.env.CURRENCY_SYMBOL ?? 'Br',
}));
