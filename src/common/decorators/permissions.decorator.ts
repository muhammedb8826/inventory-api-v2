import { SetMetadata } from '@nestjs/common';

/** User must have every listed permission (AND). */
export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** User must have at least one listed permission (OR). */
export const PERMISSIONS_ANY_KEY = 'permissions_any';
export const RequireAnyPermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_ANY_KEY, permissions);
