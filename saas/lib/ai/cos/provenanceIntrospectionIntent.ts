/** Recognizes requests for the recorded origin of the immediately prior answer. */
export function asksWhereTheAnswerCameFrom(input: string): boolean {
  const text = String(input || '').trim()
  if (!text || text.length > 360) return false

  // Direct attribution of an answer.  Do not require a second-person pronoun: users naturally say
  // “show me where the answers came from.”
  const english = /\\b(?:where(?:\\s+(?:did|do|does))?\\s+(?:the |this |that )?(?:answers?|response|reply|information)\\s+(?:come|came|comes|originated|derived)\\s+from|(?:show|tell|explain)\\b[\\s\\S]{0,70}\\bwhere\\b[\\s\\S]{0,55}\\b(?:answers?|response|reply|information)\\b[\\s\\S]{0,35}\\b(?:come|came|comes|got|derived|generated)\\b|\\b(?:where did you get|where from|what sources? did you use|show me your sources?|on what basis|citations? for)\\b[\\s\\S]{0,70}\\b(?:answer|response|reply|information|this|that)\\b)/i
  const spanish = /(?:de dónde(?:\\s+(?:vino|viene|salió|sale))?\\s+(?:esta|esa|la)?\\s*(?:respuesta|información)|(?:muestra|dime|explica)[\\s\\S]{0,70}(?:de dónde|fuentes?|citas?)[\\s\\S]{0,70}(?:respuesta|información)|en qué te basas[\\s\\S]{0,70}(?:respuesta|esto|eso))/iu
  const portuguese = /(?:de onde(?:\\s+(?:veio|vem|saiu))?\\s+(?:essa|esta|a)?\\s*(?:resposta|informação)|(?:mostre|mostra|diga|explique)[\\s\\S]{0,70}(?:de onde|fontes?|citação)[\\s\\S]{0,70}(?:resposta|informação)|em que você se baseia[\\s\\S]{0,70}(?:resposta|isso|isto))/iu
  const polish = /(?:skąd(?:\\s+(?:pochodzi|wzięła się))?\\s+(?:ta|te)?\\s*(?:odpowiedź|odpowiedzi|informacja)|(?:pokaż|powiedz|wyjaśnij)[\\s\\S]{0,70}(?:skąd|źródł[oa]|źródeł)[\\s\\S]{0,70}(?:odpowiedź|odpowiedzi|informacj))/iu
  const russian = /(?:откуда(?:\\s+(?:взялся|взялась|появился|появилась))?\\s+(?:эт(?:от|а|и))?\\s*(?:ответ|информац)|(?:покажи|скажите|объясните)[\\s\\S]{0,70}(?:откуда|источник)[\\s\\S]{0,70}(?:ответ|информац))/iu
  return english || spanish || portuguese || polish || russian
}

/** Compatibility entrypoint used by COS routing. */
export function isProvenanceIntrospectionIntent(input: string): boolean {
  const text = String(input || '')
  const explicit = /\\b(provenance|introspection|execution provenance|execution telemetry|audit trail|model contribution|model contributions|which model|what model|primary model|reasoner|semantic cache|enterprise memory|knowledge graph|learned corpus|learning corpus|cognitive skill|cognitive skills|procedural skill|procedural skills|autonomous research|external ai|external provider|internal systems?)\\b/i
  const referent = /\\b(previous|preceding|prior|last|just|that|this|answers?|response|reply|request|execution|used|invoked|contributed|generated|reasoning)\\b/i
  return asksWhereTheAnswerCameFrom(text) || (explicit.test(text) && referent.test(text))
}
