import type { Dict } from '@/lib/i18n/loadLanguage'
import en from '@/locales/en.json'

/**
 * Safe translation lookup. Always returns a string.
 * Accepts dot paths like 'hero.features.site'.
 * Falls back to English, then the provided fallback, then the key.
 */
export function t(dict: Dict | null | undefined, path: string, fallback: string): string {
  const value = lookup(dict, path)
  if (typeof value === 'string') return value

  const englishValue = lookup(en as Dict, path)
  if (typeof englishValue === 'string') return englishValue

  return fallback || path
}

function lookup(dict: Dict | null | undefined, path: string): unknown {
  if (!dict) return undefined
  return path
    .split('.')
    .reduce<any>((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), dict)
}
