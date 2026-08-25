// saas/lib/ai/cos/conversationProvenanceIntent.ts
//
// Meaning-scoped detection of "where did this come from?" questions about something COS produced
// earlier in THIS conversation. This deliberately covers artifact nouns such as idea, script,
// story, text, draft, dialogue, scenario, and concept — not only answer/response/source.
//
// Why this module exists: a visitor asked "where did the idea came from?" about a script COS had
// just written. Literal answer/source matching missed it, live-verify-by-default ran, and COS
// falsely claimed that live evidence had been retrieved. Prior-answer provenance is introspection,
// never a current-world fact lookup.
//
// Pure and deterministic: no model call, no database call, no web call.

const MAX_PROMPT_CHARS = 600

const AUTHORING_IMPERATIVE =
  /(?<![\p{L}\p{N}_])(?:write|draft|compose|create|generate|make\s+me|escribe|redacta|crea|genera|escreva|redija|crie|gere|napisz|stw[óo]rz|wygeneruj|напиши|составь|создай|сгенерируй)(?![\p{L}\p{N}_])/iu

const EN_ORIGIN =
  /(?<![\p{L}\p{N}_])(?:where\s+(?:did|do)\s+(?:you|u)\s+(?:get|find|take|pull|source)|where\s+(?:did|does)\s+(?:(?:this|that|the)\s+(?:idea|concept|scenario|answer|script|text|story|dialogue|joke|response|reply|draft)|this|that|it)\s+(?:come|came)\s+from|where(?:'s|\s+is)\s+(?:this|that|it)\s+from|what\s+(?:is|are|was|were)\s+(?:this|that|it|the\s+(?:idea|concept|scenario|answer|script|text|story|dialogue))\s+based\s+on|how\s+did\s+you\s+come\s+up\s+with|what\s+inspired\s+(?:this|that)(?:\s+(?:idea|concept|scenario|script|story|dialogue))?|did\s+you\s+(?:make|made)\s+(?:this|that|it)\s+up|did\s+you\s+(?:invent|imagine)\s+(?:this|that|it)|what\s+(?:is|was)\s+your\s+source|what\s+sources?\s+did\s+you\s+use|who\s+told\s+you)(?![\p{L}\p{N}_])/iu

const ES_ORIGIN =
  /(?<![\p{L}\p{N}_])(?:de\s+d[oó]nde\s+(?:lo\s+|la\s+|)?(?:sacaste|saca[sr]?|sac[oó]|obtuviste|sali[oó]|viene|vino|sale)|de\s+d[oó]nde\s+(?:vino|sali[oó])\s+(?:esta|esa|la)\s+(?:idea|respuesta|historia|escena|guion)|en\s+qu[eé]\s+(?:te\s+basaste|se\s+bas[oó]|se\s+basa)|c[oó]mo\s+se\s+te\s+ocurri[oó]|qu[eé]\s+inspir[oó]\s+(?:esta|esa)\s+idea|cu[aá]l\s+(?:es|fue)\s+tu\s+fuente|te\s+lo\s+inventaste|lo\s+inventaste)(?![\p{L}\p{N}_])/iu

const PT_ORIGIN =
  /(?<![\p{L}\p{N}_])(?:de\s+onde\s+(?:voc[eê]\s+)?(?:tirou|tiraste|tirei|veio|saiu|surgiu)|de\s+onde\s+(?:veio|surgiu)\s+(?:esta|essa|a)\s+(?:ideia|resposta|hist[oó]ria|cena|roteiro)|em\s+que\s+(?:voc[eê]\s+)?se\s+base(?:ou|ia)|no\s+que\s+(?:voc[eê]\s+)?se\s+base(?:ou|ia)|como\s+(?:voc[eê]\s+)?chegou\s+a\s+essa\s+ideia|o\s+que\s+inspirou\s+(?:essa|esta)\s+ideia|qual\s+(?:[ée]|foi)\s+a\s+sua\s+fonte|voc[eê]\s+inventou)(?![\p{L}\p{N}_])/iu

const PL_ORIGIN =
  /(?<![\p{L}\p{N}_])(?:sk[ąa]d\s+(?:to\s+|masz\s+)?(?:masz|wzi[ąa][łl]e[śs]|wzi[ęe][łl]a[śs]|pochodzi|wzi[ęe][łl]o|si[ęe])|sk[ąa]d\s+wzi[ąa][łl]\s+si[ęe]\s+(?:ten|taki)\s+pomys[łl]|sk[ąa]d\s+(?:wzi[ęe][łl]a|pochodzi)\s+(?:si[ęe]\s+)?(?:ta|taka)\s+(?:idea|odpowied[zź]|historia|scena)|na\s+czym\s+(?:si[ęe]\s+opiera(?:sz|)|to\s+bazuje)|jak\s+wpad[łl]e[śs]\s+na\s+(?:ten|taki)\s+pomys[łl]|co\s+zainspirowa[łl]o\s+(?:ten|taki)\s+pomys[łl]|jakie\s+(?:jest|by[łl]o)\s+[źz]r[óo]d[łl]o|wymy[śs]li[łl]e[śs]\s+to)(?![\p{L}\p{N}_])/iu

const RU_ORIGIN =
  /(?<![\p{L}\p{N}_])(?:откуда\s+(?:ты\s+|вы\s+)?(?:это\s+)?(?:вз[ья]л|взяли|взялось|появилось|знаешь|знаете)|откуда\s+(?:взял[аи]сь|появил[аи]сь)\s+(?:эта|эта\s+самая)\s+(?:идея|история|сцена)|на\s+ч[её]м\s+(?:основано|ты\s+основывал|вы\s+основывались)|как\s+(?:ты|вы)\s+придумал(?:и)?\s+(?:эту|такую)\s+идею|что\s+вдохновило\s+(?:эту|такую)\s+идею|как(?:ой|ов)\s+(?:у\s+тебя\s+|у\s+вас\s+)?источник|(?:ты|вы)\s+это\s+(?:придумал|придумали|выдумал))(?![\p{L}\p{N}_])/iu

/**
 * True when the prompt asks about the ORIGIN of something COS produced in this conversation —
 * regardless of whether the user calls it an answer, an idea, a script, a story, a draft, or it.
 */
export function isConversationProvenanceQuestion(prompt: string): boolean {
  if (typeof prompt !== 'string') return false
  const text = prompt.trim()
  if (text.length === 0 || text.length > MAX_PROMPT_CHARS) return false
  if (AUTHORING_IMPERATIVE.test(text)) return false
  return EN_ORIGIN.test(text)
    || ES_ORIGIN.test(text)
    || PT_ORIGIN.test(text)
    || PL_ORIGIN.test(text)
    || RU_ORIGIN.test(text)
}

export const CONVERSATION_PROVENANCE_MAX_PROMPT_CHARS = MAX_PROMPT_CHARS
