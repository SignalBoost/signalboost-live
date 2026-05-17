// saas/components/i18n/useTranslation.ts
// Thin wrapper around useI18n() exposing a simple t(key, fallback) function.
// Returns the dictionary value if present, otherwise the English fallback,
// otherwise the key itself.

"use client";

import { useI18n } from "./I18nProvider";

export function useTranslation() {
  const { dict, lang } = useI18n();

  function t(key: string, fallback?: string): string {
    if (dict[key]) return dict[key];
    if (fallback) return fallback;
    return key;
  }

  return { t, lang };
}
