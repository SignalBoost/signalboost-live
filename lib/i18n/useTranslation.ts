"use client";

import { useI18n } from "@/components/i18n/I18nProvider";

export function useTranslation() {
  const { dict } = useI18n();

  function t(key: string) {
    return dict[key] || key;
  }

  return { t };
}
