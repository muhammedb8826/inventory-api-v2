import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  currency: process.env.CURRENCY ?? 'ETB',
  currencySymbol: process.env.CURRENCY_SYMBOL ?? 'Br',
  /** Absolute origin for uploaded assets (no trailing slash), e.g. https://api.example.com */
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? process.env.APP_URL ?? '')
    .trim()
    .replace(/\/$/, ''),
}));
