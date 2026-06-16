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

// Console namespace lives in dedicated files so the main locale files stay lean
// and a buyer can translate the console by editing one small JSON per language.
const consoleDictionaries: Record<string, () => Promise<Dict>> = {
  en: () => import('@/locales/console.en.json').then(m => m.default as Dict),
  pt: () => import('@/locales/console.pt.json').then(m => m.default as Dict),
  es: () => import('@/locales/console.es.json').then(m => m.default as Dict),
  pl: () => import('@/locales/console.pl.json').then(m => m.default as Dict),
  ru: () => import('@/locales/console.ru.json').then(m => m.default as Dict),
}

async function loadConsole(lang: string): Promise<Dict> {
  try { return await (consoleDictionaries[lang] || consoleDictionaries.en)() }
  catch { return {} }
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
  const enConsole = await loadConsole('en')
  if (lang === 'en' || !dictionaries[lang]) {
    // Stamp the active language so suite copy (lib/i18n/suiteCopy.ts) can resolve correctly.
    return { ...english, console: enConsole, __lang: 'en' }
  }

  try {
    const localized = await dictionaries[lang]()
    const merged = mergeWithEnglishFallback(english, localized)
    const locConsole = await loadConsole(lang)
    // English fallback for any console key missing in the target language.
    merged.console = mergeWithEnglishFallback(enConsole, locConsole)
    merged.__lang = lang
    return merged
  } catch {
    return { ...english, console: enConsole, __lang: 'en' }
  }
}
