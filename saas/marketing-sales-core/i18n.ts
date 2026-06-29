// saas/marketing-sales-core/i18n.ts
import type { Lang } from './types'
import { DICTIONARIES, type MsDict } from './i18n/dictionaries'

export function msT(lang: Lang | string, key: keyof MsDict): string {
  const dict = DICTIONARIES[(lang as Lang)] || DICTIONARIES.en
  return dict[key] || DICTIONARIES.en[key]
}
export function dictFor(lang: Lang | string): MsDict {
  return DICTIONARIES[(lang as Lang)] || DICTIONARIES.en
}

// Resolve a machine error code to a localized, user-safe message. Executors return
// codes (never English); the UI calls this so nothing English reaches a user.
export function msError(lang: Lang | string, code: string): string {
  const dict = dictFor(lang) as Record<string, string>
  return dict[code] || dictFor(lang).errUnknown
}
