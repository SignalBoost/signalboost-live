// saas/lib/i18n/loadLanguage.ts
import consoleEn from './console.en.json'
import consoleEs from './console.es.json'
import consolePt from './console.pt.json'
import consolePl from './console.pl.json'
import consoleRu from './console.ru.json'

import auditEn from './audit.en.json'
import auditEs from './audit.es.json'
import auditPt from './audit.pt.json'
import auditPl from './audit.pl.json'
import auditRu from './audit.ru.json'

const CONSOLE_TABLE: Record<string, unknown> = {
  en: consoleEn, es: consoleEs, pt: consolePt, pl: consolePl, ru: consoleRu,
}
const AUDIT_TABLE: Record<string, unknown> = {
  en: auditEn, es: auditEs, pt: auditPt, pl: auditPl, ru: auditRu,
}
import onboardingLocales from './onboardingLocales.json'
import marketingSalesLocales from './marketingSalesLocales.json'
import auditCenterLocales from './auditCenterLocales.json'
import { mergeDict, mergePageLocales } from './pageLocales'

export type DictValue = string | string[] | Dict
export type Dict = { [key: string]: DictValue }

const dictionaries: Record<string, () => Promise<Dict>> = {
  en: () => import('@/locales/en.json').then(m => m.default as Dict),
  pt: () => import('@/locales/pt.json').then(m => m.default as Dict),
  es: () => import('@/locales/es.json').then(m => m.default as Dict),
  pl: () => import('@/locales/pl.json').then(m => m.default as Dict),
  ru: () => import('@/locales/ru.json').then(m => m.default as Dict),
}

function loadConsole(lang: string): Dict {
  const table = CONSOLE_TABLE as Record<string, Dict>
  return table[lang] || table.en || {}
}

function loadAudit(lang: string): Dict {
  const table = AUDIT_TABLE as Record<string, Dict>
  return table[lang] || table.en || {}
}

function loadAuditCenter(lang: string): Dict {
  const table = auditCenterLocales as unknown as Record<string, Dict>
  return table[lang] || table.en || {}
}

function loadOnboarding(lang: string): Dict {
  const table = onboardingLocales as unknown as Record<string, Dict>
  return table[lang] || table.en || {}
}

function loadMarketingSales(lang: string): Dict {
  const table = marketingSalesLocales as unknown as Record<string, Dict>
  return table[lang] || table.en || {}
}

function isDict(value: DictValue | undefined): value is Dict {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function mergeWithEnglishFallback(english: Dict, localized: Dict): Dict {
  const merged: Dict = { ...english }
  for (const [key, value] of Object.entries(localized)) {
    const englishValue = english[key]
    if (isDict(englishValue) && isDict(value)) {
      merged[key] = mergeWithEnglishFallback(englishValue, value)
    } else {
      merged[key] = value
    }
  }
  return merged
}

export async function loadLanguage(lang: string): Promise<Dict> {
  const english = mergePageLocales(await dictionaries.en(), 'en')
  const enConsole = loadConsole('en')
  const enAudit = mergeDict(loadAudit('en'), loadAuditCenter('en'))
  const enMarketingSales = loadMarketingSales('en')
  if (lang === 'en' || !dictionaries[lang]) {
    return { ...english, console: enConsole, audit: enAudit, onboarding: loadOnboarding('en'), marketingSales: enMarketingSales, __lang: 'en' }
  }

  try {
    const localized = mergePageLocales(await dictionaries[lang](), lang)
    const merged = mergeDict(mergeWithEnglishFallback(english, localized), localized)
    merged.console = mergeWithEnglishFallback(enConsole, loadConsole(lang))
    merged.audit = mergeWithEnglishFallback(enAudit, mergeDict(loadAudit(lang), loadAuditCenter(lang)))
    merged.onboarding = mergeWithEnglishFallback(loadOnboarding('en'), loadOnboarding(lang))
    merged.marketingSales = mergeWithEnglishFallback(enMarketingSales, loadMarketingSales(lang))
    merged.__lang = lang
    return merged
  } catch {
    return { ...english, console: enConsole, audit: enAudit, onboarding: loadOnboarding('en'), marketingSales: enMarketingSales, __lang: 'en' }
  }
}
