// saas/lib/cos/i18n.ts
// COS i18n enforcement. Every COS UI string resolves through cosT() — no hard-coded
// English. Dictionaries are BUNDLED in ./i18n/dictionaries so the module is portable
// (no dependency on the host's /locales folder). Structure parity across the five
// languages is enforced in CI by scripts/verify-cos-locale-parity.mjs.

import { COS_DICTS, COS_LANGS, CosLang } from './i18n/dictionaries'

export type { CosLang }
export { COS_LANGS }

function normalizeLang(site_language: string | null | undefined): CosLang {
  const l = (site_language || 'en').slice(0, 2).toLowerCase()
  return (COS_LANGS as string[]).includes(l) ? (l as CosLang) : 'en'
}

function lookup(dict: any, path: string): unknown {
  return path.split('.').reduce((acc, k) => (acc && typeof acc === 'object' ? acc[k] : undefined), dict)
}

/**
 * Resolve a cos.* dotted key for the given language, falling back to English, then to the
 * provided fallback (or the key). Pass the key WITHOUT the leading "cos." —
 * e.g. cosT(lang, 'mining.title').
 */
export function cosT(site_language: string | null | undefined, path: string, fallback?: string): string {
  const lang = normalizeLang(site_language)
  const full = `cos.${path}`
  const v = lookup(COS_DICTS[lang], full)
  if (typeof v === 'string') return v
  const enV = lookup(COS_DICTS.en, full)
  if (typeof enV === 'string') return enV
  return fallback ?? path
}

/** Human-readable, localized label for a mined feature machine name. */
export function localizeFeatureName(site_language: string | null | undefined, machineName: string): string {
  return cosT(site_language, `features.names.${machineName}`, machineName)
}

/** Localized SEO / page metadata for a COS page. */
export function localizeMeta(site_language: string | null | undefined): { title: string; description: string } {
  return {
    title: cosT(site_language, 'meta.title'),
    description: cosT(site_language, 'meta.description'),
  }
}
