// saas/lib/cos/i18n.ts
// COS i18n enforcement. Every COS page/component/card resolves text through cosT() — no
// hard-coded English. Dictionaries live in /locales/cos.{lang}.json with identical
// structure (enforced in CI by scripts/verify-cos-locale-parity.mjs). Bridges to the
// app's existing t() convention; here we own the cos.* namespace end-to-end.

import en from '@/locales/cos.en.json'
import es from '@/locales/cos.es.json'
import pt from '@/locales/cos.pt.json'
import pl from '@/locales/cos.pl.json'
import ru from '@/locales/cos.ru.json'

export type CosLang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const DICTS: Record<CosLang, any> = { en, es, pt, pl, ru }
export const COS_LANGS: CosLang[] = ['en', 'es', 'pt', 'pl', 'ru']

function normalizeLang(site_language: string | null | undefined): CosLang {
  const l = (site_language || 'en').slice(0, 2).toLowerCase()
  return (COS_LANGS as string[]).includes(l) ? (l as CosLang) : 'en'
}

function lookup(dict: any, path: string): unknown {
  return path.split('.').reduce((acc, k) => (acc && typeof acc === 'object' ? acc[k] : undefined), dict)
}

/**
 * Resolve a cos.* dotted key for the given language, falling back to English, then to the
 * provided fallback (or the key itself). Pass the key WITHOUT the leading "cos." — e.g.
 * cosT(lang, 'mining.title').
 */
export function cosT(site_language: string | null | undefined, path: string, fallback?: string): string {
  const lang = normalizeLang(site_language)
  const full = `cos.${path}`
  const v = lookup(DICTS[lang], full)
  if (typeof v === 'string') return v
  const enV = lookup(DICTS.en, full)
  if (typeof enV === 'string') return enV
  return fallback ?? path
}

/** Human-readable, localized label for a mined feature machine name. */
export function localizeFeatureName(site_language: string | null | undefined, machineName: string): string {
  return cosT(site_language, `features.names.${machineName}`, machineName)
}

/** Localized SEO metadata for a COS page. */
export function localizeMeta(site_language: string | null | undefined): { title: string; description: string } {
  return {
    title: cosT(site_language, 'meta.title'),
    description: cosT(site_language, 'meta.description'),
  }
}
