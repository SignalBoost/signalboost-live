import en from '@/locales/en.json' with { type: 'json' }
import type { Dict } from '@/lib/i18n/loadLanguage'

const ENGLISH = en as Dict
let activeDictionary: Dict = ENGLISH

function lookup(dict: Dict | null | undefined, path: string): unknown {
  if (!dict) return undefined
  return path
    .split('.')
    .reduce<unknown>((value, key) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
      return (value as Record<string, unknown>)[key]
    }, dict)
}

export function setRuntimeDictionary(dict: Dict | null | undefined): void {
  if (typeof window === 'undefined') return
  activeDictionary = dict ?? ENGLISH
}

export function uiText(path: string): string {
  const active = lookup(activeDictionary, path)
  if (typeof active === 'string') return active

  const english = lookup(ENGLISH, path)
  if (typeof english === 'string') return english

  return path
}
