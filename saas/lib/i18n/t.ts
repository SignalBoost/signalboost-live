import type { Dict } from '@/lib/i18n/loadLanguage'
import en from '@/locales/en.json'
import { DASHBOARD_COPY } from '@/lib/i18n/dashboardCopy'
import { PLATFORM_COPY } from '@/lib/i18n/platformCopy'
import { SUITE_COPY } from '@/lib/i18n/suiteCopy'

/**
 * Safe translation lookup. Always returns a string.
 * Accepts dot paths like 'hero.features.site'.
 *
 * Resolution order:
 * 1. the active dictionary (main locale JSON)
 * 2. dashboardCopy for dashboard/workspace copy
 * 3. platformCopy for pricing/platform copy
 * 4. suiteCopy for newer dashboard pages
 * 5. English in the main dictionary
 * 6. dashboardCopy English fallback
 * 7. platformCopy English fallback
 * 8. suiteCopy English fallback
 * 9. provided fallback, then the key
 */
export function t(dict: Dict | null | undefined, path: string, fallback: string): string {
  const value = lookup(dict, path)
  if (typeof value === 'string') return value

  const lang = (dict as any)?.__lang
  const safeLang = typeof lang === 'string' ? lang : 'en'

  const dashboardForLang = DASHBOARD_COPY[safeLang]
  if (dashboardForLang && typeof dashboardForLang[path] === 'string') {
    return dashboardForLang[path]
  }

  const platformForLang = PLATFORM_COPY[safeLang]
  if (platformForLang && typeof platformForLang[path] === 'string') {
    return platformForLang[path]
  }

  const suiteForLang = SUITE_COPY[safeLang]
  if (suiteForLang && typeof suiteForLang[path] === 'string') {
    return suiteForLang[path]
  }

  const englishValue = lookup(en as Dict, path)
  if (typeof englishValue === 'string') return englishValue

  if (typeof DASHBOARD_COPY.en[path] === 'string') return DASHBOARD_COPY.en[path]

  if (typeof PLATFORM_COPY.en[path] === 'string') return PLATFORM_COPY.en[path]

  if (typeof SUITE_COPY.en[path] === 'string') return SUITE_COPY.en[path]

  return fallback || path
}

function lookup(dict: Dict | null | undefined, path: string): unknown {
  if (!dict) return undefined

  return path
    .split('.')
    .reduce<any>((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), dict)
}
