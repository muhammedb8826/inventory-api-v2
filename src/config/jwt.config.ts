import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  accessSecret: process.env.JWT_AT_SECRET ?? 'change-me',
  refreshSecret: process.env.JWT_RT_SECRET ?? 'change-me-rt',
  accessExpiresIn: process.env.JWT_AT_EXPIRES_IN ?? '1d',
  refreshExpiresIn: process.env.JWT_RT_EXPIRES_IN ?? '7d',
}));
