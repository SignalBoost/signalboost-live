const dictionaries: Record<
  string,
  () => Promise<Record<string, string>>
> = {
  en: () =>
    import('@/locales/en.json')
      .then(m => m.default),

  es: () =>
    import('@/locales/es.json')
      .then(m => m.default),

  pt: () =>
    import('@/locales/pt.json')
      .then(m => m.default),

  pl: () =>
    import('@/locales/pl.json')
      .then(m => m.default),

  ru: () =>
    import('@/locales/ru.json')
      .then(m => m.default),
}

export async function loadLanguage(
  lang: string
): Promise<Record<string,string>> {

  const safeLang =
    dictionaries[lang]
      ? lang
      : 'en'

  return dictionaries[safeLang]()
}
