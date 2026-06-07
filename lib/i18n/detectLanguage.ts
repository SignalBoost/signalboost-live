const SUPPORTED_LANGUAGES = ['en', 'es', 'pt', 'pl', 'ru']

export function detectLanguage() {
  if (typeof window === 'undefined') return 'en'

  const saved = localStorage.getItem('site-language')
  if (saved && SUPPORTED_LANGUAGES.includes(saved)) return saved

  const cookieLocale = document.cookie
    .split('; ')
    .find((cookie) => cookie.startsWith('NEXT_LOCALE='))
    ?.split('=')[1]
  if (cookieLocale && SUPPORTED_LANGUAGES.includes(cookieLocale)) return cookieLocale

  const browser = navigator.language.split('-')[0]
  if (SUPPORTED_LANGUAGES.includes(browser)) return browser

  return 'en'
}
