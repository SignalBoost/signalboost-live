/** True only for a request to reveal the recorded origin of a prior answer. */
export function isProvenanceIntrospection(input: string): boolean {
  const provenance = /\b(provenance|introspection|execution provenance|execution telemetry|audit trail|model contribution|model contributions|which model|what model|primary model|reasoner|semantic cache|enterprise memory|knowledge graph|learned corpus|learning corpus|cognitive skill|cognitive skills|procedural skill|procedural skills|autonomous research|external ai|external provider|internal systems?)\b/i
  const sourceAttribution = /\b(?:where|what)\b[\s\S]{0,50}\b(?:source|sources|from|based on|cite|citation|evidence)\b|\b(?:show|tell|explain)\b[\s\S]{0,50}\b(?:where|what)\b[\s\S]{0,30}\b(?:got|came|comes|generated|derived)\b/i
  const referent = /\b(previous|preceding|prior|last|just|that|this|answer|response|request|execution|used|invoked|contributed|generated|reasoning)\b/i
  return (provenance.test(input) || sourceAttribution.test(input)) && referent.test(input)
}

/** Natural-language, multilingual requests for the origin of the assistant's prior answer. */
export function asksWhereTheAnswerCameFrom(input: string): boolean {
  const text = String(input || '').trim().toLocaleLowerCase()
  if (!text || text.length > 300) return false
  if (/\b(?:how do you know|cómo lo sabes|como você sabe|skąd wiesz|как (?:ты|вы) знаешь)\b[^?]*\b(?:when|whether|if|cuándo|si|quando|se|kiedy|czy|когда|если|ли)\b/iu.test(text)) return false

  const english = /\b(?:where did you get|where from|what sources? did you use|show me your sources?|how do you know|on what basis|citations? for)\b/i.test(text) && /\b(?:you|your|answer|response|reply|information|this|that|it)\b/i.test(text)
  const spanish = /(?:de dónde|fuentes?|citas?|en qué te basas|cómo lo sabes|según qué)/iu.test(text) && /(?:tú|tu|tus|sus|usted|sacaste|dijiste|respuesta|información|esto|eso)/iu.test(text)
  const portuguese = /(?:de onde|fontes?|citação|em que você se baseia|como você sabe|segundo o quê)/iu.test(text) && /(?:você|voce|suas|seus|tirou|disse|resposta|informação|isso|isto)/iu.test(text)
  const polish = /(?:skąd|źródł[oa]|źródeł|na jakiej podstawie)/iu.test(text) && /(?:masz|wiesz|twoj|twoje|wziąłeś|wzięłaś|znalazłeś|znalazłaś|podałeś|podałaś|odpowiedź|informacj|to|te|tę)/iu.test(text)
  const russian = /(?:откуда|источник|на основании чего)/iu.test(text) && /(?:ты|вы|тебя|вас|ваши|знаешь|сказал|сказали|взял|взяли|ответ|информац|это|эта|эти)/iu.test(text)
  return english || spanish || portuguese || polish || russian
}
