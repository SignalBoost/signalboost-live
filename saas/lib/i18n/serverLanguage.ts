import { cookies } from 'next/headers'

export type SupportedLanguage = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const SUPPORTED = new Set<SupportedLanguage>(['en', 'es', 'pt', 'pl', 'ru'])

export function normalizeServerLanguage(value?: string | null): SupportedLanguage {
  const candidate = String(value || '').slice(0, 2).toLowerCase() as SupportedLanguage
  return SUPPORTED.has(candidate) ? candidate : 'en'
}

export async function getServerLanguage(explicit?: string | null): Promise<SupportedLanguage> {
  const store = await cookies()
  return normalizeServerLanguage(
    explicit ||
      store.get('signalboost_language')?.value ||
      store.get('site-language')?.value ||
      store.get('sb_locale')?.value ||
      'en',
  )
}
