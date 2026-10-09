import { normalizeSupportedLanguage } from './supportedLanguages.ts'

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

  return normalizeSupportedLanguage(lang)
}
