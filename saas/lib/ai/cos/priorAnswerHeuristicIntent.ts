// saas/lib/ai/cos/priorAnswerHeuristicIntent.ts
//
// Detect questions about WHY the assistant's immediately preceding answer was shaped the way it
// was. These are provenance/introspection questions, not fresh content questions: they must be
// answered from the recorded prior-turn execution state instead of asking a model to reconstruct
// which heuristics, rules, policies, memories, caches, or instructions probably mattered.

const HEURISTIC_TERMS = /\b(?:heuristics?|rules?|instructions?|polic(?:y|ies)|criteria|decision\s+process|reasoning\s+rules?|guidelines?)\b/i
const INFLUENCE_TERMS = /\b(?:influenc(?:e|ed|ing)|shap(?:e|ed|ing)|affect(?:ed|ing)?|determin(?:e|ed|ing)|dr(?:ive|ove|iven)|appl(?:y|ied)|use(?:d)?|behind|why)\b/i
const PRIOR_OUTPUT_TERMS = /\b(?:your\s+)?(?:output|answer|response|reply|result)|\bwhat\s+you\s+(?:wrote|said|returned|generated)|\bprevious\s+(?:answer|response|reply|output)|\blast\s+(?:answer|response|reply|output)\b/i

// Equivalent high-signal phrasings in the other platform languages. These deliberately require a
// prior-output referent so questions such as "what heuristics should I use for debugging?" remain
// ordinary content questions.
const NON_ENGLISH_PRIOR_HEURISTIC = /(?:
  (?=.*\b(?:heur[ií]sticas?|reglas?|instrucciones?|pol[ií]ticas?|criterios?)\b)(?=.*\b(?:tu|tus|su|respuesta|salida|resultado)\b)(?=.*\b(?:influy|afect|determin|usaste|aplic|por\s+qu[eé])\b)
| (?=.*\b(?:heur[ií]sticas?|regras?|instru[cç][oõ]es?|pol[ií]ticas?|crit[eé]rios?)\b)(?=.*\b(?:sua|seu|resposta|sa[ií]da|resultado)\b)(?=.*\b(?:influenc|afet|determin|usou|aplic|por\s+qu[eê])\b)
| (?=.*\b(?:heurystyk\w*|zasad\w*|instrukcj\w*|polityk\w*|kryteri\w*)\b)(?=.*\b(?:twoj\w*|odpowied[zź]\w*|wynik\w*)\b)(?=.*\b(?:wp[lł]yn\w*|kszta[lł]t\w*|zdecyd\w*|u[zż]y\w*|dlaczego)\b)
| (?=.*\b(?:эвристик\w*|правил\w*|инструкц\w*|политик\w*|критери\w*)\b)(?=.*\b(?:ваш\w*|твой\w*|ответ\w*|результат\w*)\b)(?=.*\b(?:влиял\w*|определ\w*|использ\w*|примен\w*|почему)\b)
)/iux

export function asksWhichHeuristicsInfluencedPriorAnswer(input: string): boolean {
  const text = String(input || '').trim()
  if (!text || text.length > 400) return false
  if (NON_ENGLISH_PRIOR_HEURISTIC.test(text)) return true
  if (!HEURISTIC_TERMS.test(text)) return false
  if (!PRIOR_OUTPUT_TERMS.test(text)) return false
  return INFLUENCE_TERMS.test(text)
}
