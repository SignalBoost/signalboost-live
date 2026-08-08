import pagesEn from '@/locales/pages.en.json'
import pagesEs from '@/locales/pages.es.json'
import pagesPt from '@/locales/pages.pt.json'
import pagesPl from '@/locales/pages.pl.json'
import pagesRu from '@/locales/pages.ru.json'
import type { Dict, DictValue } from '@/lib/i18n/loadLanguage'

const PAGE_TABLE: Record<string, Dict> = {
  en: pagesEn as Dict,
  es: pagesEs as Dict,
  pt: pagesPt as Dict,
  pl: pagesPl as Dict,
  ru: pagesRu as Dict,
}

function isDict(value: DictValue | undefined): value is Dict {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function mergePageLocales(base: Dict, lang: string): Dict {
  const localized = PAGE_TABLE[lang] || PAGE_TABLE.en || {}
  return mergeDict(base, localized)
}

export function mergeDict(base: Dict, localized: Dict): Dict {
  const merged: Dict = { ...base }
  for (const [key, value] of Object.entries(localized)) {
    const existing = base[key]
    if (isDict(existing) && isDict(value)) merged[key] = mergeDict(existing, value)
    else merged[key] = value
  }
  return merged
}
