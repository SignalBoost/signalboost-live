import type { Dict } from '@/lib/i18n/loadLanguage'

/**
 * Safe translation lookup. Always returns a string.
 * Accepts dot paths like 'hero.features.site'.
 * Falls back to the provided string if the key is missing or non-string.
 */
export function t(dict: Dict | null | undefined, path: string, fallback: string): string {
  if (!dict) return fallback
  const value = path
    .split('.')
    .reduce<any>((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), dict)
  return typeof value === 'string' ? value : fallback
}
