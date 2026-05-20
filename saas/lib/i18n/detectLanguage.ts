export function detectLanguage(): string {
  if (typeof navigator === 'undefined') {
    return 'en'
  }

  const lang =
    (
      navigator.languages?.[0] ||
      navigator.language ||
      'en'
    ).toLowerCase()

  if (lang.startsWith('pt')) {
    return 'pt'
  }

  if (lang.startsWith('es')) {
    return 'es'
  }

  if (lang.startsWith('pl')) {
    return 'pl'
  }

  if (lang.startsWith('ru')) {
    return 'ru'
  }

  if (lang.startsWith('en')) {
    return 'en'
  }

  return 'en'
}
