// saas/lib/cultural-calendar/index.ts
// Public API for the cultural calendar module.
// The dashboard imports getGreetingForUser() from here.

import { englishGreeting } from './en.ts'
import { spanishGreeting } from './es.ts'
import { portugueseGreeting } from './pt.ts'
import { polishGreeting } from './pl.ts'
import { russianGreeting } from './ru.ts'
import type { GreetingContext, Greeting } from './helpers.ts'

export type SupportedLocale = 'en' | 'es' | 'pt' | 'pl' | 'ru'
export type { GreetingContext, Greeting }

// Detect user's locale from browser. Falls back to 'en'.
// Maps things like "pt-BR" or "pt-PT" -> "pt".
export function detectLocale(): SupportedLocale {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'en'
  }
  const raw = (navigator.language || 'en').toLowerCase()
  if (raw.startsWith('es')) return 'es'
  if (raw.startsWith('pt')) return 'pt'
  if (raw.startsWith('pl')) return 'pl'
  if (raw.startsWith('ru')) return 'ru'
  return 'en'
}

// Pick the right greeting based on locale + context + today's date.
export function getGreeting(locale: SupportedLocale, ctx: GreetingContext): Greeting {
  const now = new Date()
  switch (locale) {
    case 'es': return spanishGreeting(now, ctx)
    case 'pt': return portugueseGreeting(now, ctx)
    case 'pl': return polishGreeting(now, ctx)
    case 'ru': return russianGreeting(now, ctx)
    case 'en':
    default:   return englishGreeting(now, ctx)
  }
}

// Convenience for the dashboard: auto-detect from browser and return.
export function getGreetingForUser(ctx: GreetingContext): Greeting {
  return getGreeting(detectLocale(), ctx)
}
