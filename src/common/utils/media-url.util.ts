import { ConfigService } from '@nestjs/config';

/** Build an absolute URL for files under `/uploads/...`. */
export function absoluteMediaUrl(
  path: string | null | undefined,
  options?: { publicBaseUrl?: string | null; requestBaseUrl?: string | null },
): string | null {
  if (!path?.trim()) return null;
  const trimmed = path.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const configured = options?.publicBaseUrl?.trim() ?? '';
  const request = options?.requestBaseUrl?.trim() ?? '';
  const base = (configured || request).replace(/\/$/, '');
  if (!base) return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${base}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
}

export function publicBaseFromConfig(config: ConfigService): string {
  return (config.get<string>('app.publicBaseUrl') ?? '').trim();
}
