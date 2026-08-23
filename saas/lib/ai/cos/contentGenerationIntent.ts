const GENERATION = /^\s*(?:write|draft|create|generate|design|produce|escribe|redacta|crea|escreva|redija|crie|napisz|stw[oó]rz|zaprojektuj|напиши|создай|сгенерируй)\b/iu

/** Authoring creates an artifact; it is not a current-world factual lookup. */
export function isContentGenerationRequest(input: string): boolean {
  return GENERATION.test(String(input || '').trim())
}
