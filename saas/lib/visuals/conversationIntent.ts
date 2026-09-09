import { isConciergeVisualObjective } from './intent.ts'

type ConversationMessage = Readonly<{ role?: unknown; content?: unknown }>

const MAX_VISUAL_HISTORY_USER_TURNS = 6
const MAX_VISUAL_CONTEXT_CHARS = 8000

const TEXTUAL_DISCUSSION = /\b(?:explain|describe|tell\s+me|write|draft|summari[sz]e|analy[sz]e|compare|why\b|explica|descrev|dime|escribe|redacta|resume|analiza|compara|wyjasnij|opisz|napisz|podsumuj|przeanalizuj|porownaj|объясни|опиши|напиши|резюм|проанализируй|сравни)\b/i

const VISUAL_REVISION_PATTERNS = [
  // English
  /\b(?:redo|redesign|rework|revise|refine|improve|adjust|modify|tweak)\b/i,
  /\b(?:try\s+again|do\s+something\s+better|more\s+creative|another\s+(?:one|version|design|logo|image)|new\s+version)\b/i,
  /\b(?:make|change|update)\s+(?:it|that|this|the\s+(?:design|logo|image|visual|mark|wordmark))\s+(?:better|more|less|different|bolder|cleaner|simpler|modern|creative|minimal)/i,
  /\b(?:i\s+want|i\s+need|show\s+me|give\s+me)\s+(?:the\s+|a\s+|another\s+)?(?:design|logo|image|visual|mark|wordmark)\b/i,
  /\bhow\s+would\s+you\s+(?:design|redesign|style|render)\b/i,
  /\b(?:not|isn['’]?t|wasn['’]?t)\b[^.!?]{0,40}\b(?:creative|good|right|strong)\b/i,
  // Portuguese
  /\b(?:refaca|refazer|redesenhe|redesenhar|revise|refine|melhore|melhorar|ajuste|ajustar|modifique|modificar)\b/i,
  /\b(?:tente\s+de\s+novo|faca\s+algo\s+melhor|mais\s+criativ[oa]|outra\s+versao)\b/i,
  /\b(?:quero|preciso|mostre|me\s+de)\b[^.!?]{0,24}\b(?:design|logotipo|logo|imagem|visual|marca)\b/i,
  // Spanish
  /\b(?:rehaz|rehacer|redisena|redisenar|revisa|refina|mejora|mejorar|ajusta|ajustar|modifica|modificar)\b/i,
  /\b(?:intenta\s+de\s+nuevo|haz\s+algo\s+mejor|mas\s+creativ[oa]|otra\s+version)\b/i,
  /\b(?:quiero|necesito|muestrame|dame)\b[^.!?]{0,24}\b(?:diseno|logo|imagen|visual|marca)\b/i,
  // Polish (Latin diacritics optional in common variants)
  /\b(?:przeprojektuj|popraw|ulepsz|zmien|zmień|dostosuj|zmodyfikuj|przerob|przerób)\b/i,
  /\b(?:sprobuj\s+ponownie|spróbuj\s+ponownie|zrob\s+cos\s+lepszego|zrób\s+coś\s+lepszego|bardziej\s+kreatywn|inna\s+wersja)\b/i,
  /\b(?:chce|chcę|potrzebuje|potrzebuję|pokaz|pokaż)\b[^.!?]{0,24}\b(?:projekt|logo|obraz|grafik|wizual)\b/i,
  // Russian
  /(?:переделай|переработай|улучши|измени|скорректируй|доработай|обнови)/i,
  /(?:попробуй\s+снова|сделай\s+лучше|более\s+креатив|другая\s+версия)/i,
  /(?:хочу|нужен|нужна|покажи)[^.!?]{0,24}(?:дизайн|логотип|изображение|картинк|визуал)/i,
] as const

function isVisualRevisionRequest(prompt: string): boolean {
  const value = String(prompt || '').trim()
  if (!value || TEXTUAL_DISCUSSION.test(value)) return false
  return VISUAL_REVISION_PATTERNS.some((pattern) => pattern.test(value))
}

/**
 * Resolves elliptical visual revisions against the immediately contiguous user-authored
 * visual thread. Assistant prose is never authority. We stop at the first unrelated user
 * turn and cap history so an old visual cannot hijack a later request or trigger a paid
 * generation merely because the user says a common pronoun such as "it" or "that".
 */
export function resolveConciergeVisualObjective(
  messages: readonly ConversationMessage[],
  latestPrompt: string,
): string | null {
  const latest = String(latestPrompt || '').trim()
  if (!latest) return null
  if (isConciergeVisualObjective(latest)) return latest
  if (!isVisualRevisionRequest(latest)) return null

  const revisions: string[] = [latest]
  let userTurnsInspected = 0

  for (let index = messages.length - 2; index >= 0 && userTurnsInspected < MAX_VISUAL_HISTORY_USER_TURNS; index -= 1) {
    const message = messages[index]
    if (message?.role !== 'user' || typeof message.content !== 'string') continue
    userTurnsInspected += 1
    const prior = message.content.trim()
    if (!prior) continue

    if (isConciergeVisualObjective(prior)) {
      const revisionHistory = revisions.slice().reverse().join('\n')
      const resolved = `${prior}\n\nFOLLOW-UP REVISION HISTORY:\n${revisionHistory}`
      return resolved.length <= MAX_VISUAL_CONTEXT_CHARS ? resolved : null
    }

    if (isVisualRevisionRequest(prior)) {
      revisions.push(prior)
      continue
    }

    // An unrelated user turn breaks the visual thread. Never scan through it to an old image.
    return null
  }

  return null
}
