const GENERATION_VERB = '(?:write|draft|create|generate|design|produce|escribe|redacta|crea|escreva|redija|crie|napisz|stw[oó]rz|zaprojektuj|напиши|создай|сгенерируй)'
const GENERATION = new RegExp(`^\\s*${GENERATION_VERB}\\b`, 'iu')
const CONTEXT_THEN_GENERATION = new RegExp(`[.!;:]["'’”)]?\\s+${GENERATION_VERB}\\b`, 'iu')

/**
 * Authoring creates an artifact; it is not a current-world factual lookup.
 *
 * Users often provide scenario facts first and put the actual creation/design request in a later
 * sentence (for example, "Margins fell ... Design a 90-day plan"). Those supplied facts are task
 * context, not external claims COS must independently re-establish before doing the requested work.
 * A preceding question still routes normally so a real factual lookup cannot be hidden in front of
 * an authoring instruction.
 */
export function isContentGenerationRequest(input: string): boolean {
  const text = String(input || '').trim()
  if (GENERATION.test(text)) return true

  const match = CONTEXT_THEN_GENERATION.exec(text)
  if (!match) return false

  const contextBeforeInstruction = text.slice(0, match.index + 1)
  return !contextBeforeInstruction.includes('?')
}
