import type { Dict } from '@/lib/i18n/loadLanguage'
import en from '@/locales/en.json'
import { SUITE_COPY } from '@/lib/i18n/suiteCopy'

/**
 * Safe translation lookup. Always returns a string.
 * Accepts dot paths like 'hero.features.site'.
 * Resolution order:
 *   1. the active dictionary (main locale JSON)
 *   2. the Confidence Suite copy for the active language
 *   3. English in the main dictionary
 *   4. the provided fallback, then the key
 */
export function t(dict: Dict | null | undefined, path: string, fallback: string): string {
  const value = lookup(dict, path)
  if (typeof value === 'string') return value

  // Suite copy: new pages whose keys aren't in the large locale JSONs yet.
  const lang = (dict as any)?.__lang
  const suiteForLang = (typeof lang === 'string' && SUITE_COPY[lang]) || undefined
  if (suiteForLang && typeof suiteForLang[path] === 'string') return suiteForLang[path]

  const englishValue = lookup(en as Dict, path)
  if (typeof englishValue === 'string') return englishValue

  // Suite copy English fallback
  if (typeof SUITE_COPY.en[path] === 'string') return SUITE_COPY.en[path]

  return fallback || path
}

function lookup(dict: Dict | null | undefined, path: string): unknown {
  if (!dict) return undefined
  return path
    .split('.')
    .reduce<any>((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), dict)
}
