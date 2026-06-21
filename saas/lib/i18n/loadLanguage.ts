// saas/lib/i18n/loadLanguage.ts
// Console strings live in per-language files next to this loader
// (console.en.json, console.es.json, ...). A buyer translates the console by
// editing the string values in the file for their language — no code changes.
import consoleEn from './console.en.json'
import consoleEs from './console.es.json'
import consolePt from './console.pt.json'
import consolePl from './console.pl.json'
import consoleRu from './console.ru.json'

// Audit Center strings — same per-language pattern, mounted at top-level `audit`
// so keys resolve as t('audit.report.identityAccess.title', '…').
import auditEn from './audit.en.json'
import auditEs from './audit.es.json'
import auditPt from './audit.pt.json'
import auditPl from './audit.pl.json'
import auditRu from './audit.ru.json'

// Per-language console dictionaries (split out of the former single console
// locale file so each stays small enough to read and edit cleanly).
const CONSOLE_TABLE: Record<string, unknown> = {
  en: consoleEn, es: consoleEs, pt: consolePt, pl: consolePl, ru: consoleRu,
}
const AUDIT_TABLE: Record<string, unknown> = {
  en: auditEn, es: auditEs, pt: auditPt, pl: auditPl, ru: auditRu,
}
import onboardingLocales from './onboardingLocales.json'

export type DictValue = string | string[] | Dict
export type Dict = { [key: string]: DictValue }

const dictionaries: Record<string, () => Promise<Dict>> = {
  en: () =>
    import('@/locales/en.json').then(m => m.default as Dict),
  pt: () =>
    import('@/locales/pt.json').then(m => m.default as Dict),
  es: () =>
    import('@/locales/es.json').then(m => m.default as Dict),
  pl: () =>
    import('@/locales/pl.json').then(m => m.default as Dict),
  ru: () =>
    import('@/locales/ru.json').then(m => m.default as Dict),
}

function loadConsole(lang: string): Dict {
  const table = CONSOLE_TABLE as Record<string, Dict>
  return table[lang] || table.en || {}
}

function loadAudit(lang: string): Dict {
  const table = AUDIT_TABLE as Record<string, Dict>
  return table[lang] || table.en || {}
}

function loadOnboarding(lang: string): Dict {
  const table = onboardingLocales as unknown as Record<string, Dict>
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
  const english = await dictionaries.en()
  const enConsole = loadConsole('en')
  const enAudit = loadAudit('en')
  if (lang === 'en' || !dictionaries[lang]) {
    // Stamp the active language so suite copy (lib/i18n/suiteCopy.ts) can resolve correctly.
    return { ...english, console: enConsole, audit: enAudit, onboarding: loadOnboarding('en'), __lang: 'en' }
  }

  try {
    const localized = await dictionaries[lang]()
    const merged = mergeWithEnglishFallback(english, localized)
    // English fallback for any console/audit key missing in the target language.
    merged.console = mergeWithEnglishFallback(enConsole, loadConsole(lang))
    merged.audit = mergeWithEnglishFallback(enAudit, loadAudit(lang))
    merged.onboarding = mergeWithEnglishFallback(loadOnboarding('en'), loadOnboarding(lang))
    merged.__lang = lang
    return merged
  } catch {
    return { ...english, console: enConsole, audit: enAudit, onboarding: loadOnboarding('en'), __lang: 'en' }
  }
}
