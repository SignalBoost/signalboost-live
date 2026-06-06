'use client'

/**
 * Simple hook that returns a translation function.
 * For now, always returns the fallback (English).
 * Later, wire to context for full i18n support with locales/*.json.
 */
export function useTranslation() {
  const t = (key: string, fallback: string) => fallback
  return { t }
}
