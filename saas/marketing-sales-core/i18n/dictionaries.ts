// saas/marketing-sales-core/i18n/dictionaries.ts
// Five-language dictionaries. The JSON files under ./data are the SINGLE SOURCE
// of truth — this file only imports and types them, and the CI parity guard
// validates the same JSON. No inline copy can drift, and the data travels inside
// the module (self-contained / portable). No English default leaks: every key
// must exist in every language (enforced by verify-marketing-sales-locale-parity).
import type { Lang } from '../types'
import en from './data/en.json'
import es from './data/es.json'
import pt from './data/pt.json'
import pl from './data/pl.json'
import ru from './data/ru.json'

export type MsDict = typeof en

export const DICTIONARIES: Record<Lang, MsDict> = { en, es, pt, pl, ru }
