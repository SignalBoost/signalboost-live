// saas/lib/ai/cos/simpleKnowledgeIntent.ts
//
// Conservative, dependency-free classifier for the under-10-second stable-knowledge lane.
// False negatives are acceptable: uncertain/current/action requests must stay on governed COS paths.

const SIMPLE_QUESTION_PREFIX =
  /^(?:what(?:'s|\s+is|\s+are|\s+was|\s+were)?|who(?:'s|\s+is|\s+was)?|where(?:'s|\s+is|\s+was)?|when(?:'s|\s+is|\s+was|\s+did)?|which|how\s+(?:many|much|old|long|far|tall|high|deep))\b/i

const CURRENT_OR_VOLATILE =
  /\b(?:current|currently|today|tonight|tomorrow|yesterday|latest|recent|recently|now|right\s+now|live|this\s+(?:week|month|year)|weather|forecast|temperature|score|standings?|ranking|polls?|election|price|cost|stock|market|exchange\s+rate|interest\s+rate|availability|open\s+now|opening\s+hours?|schedule|release\s+date|version|population|gdp|president|prime\s+minister|governor|mayor|ceo|minister|officeholder)\b/i

const ACTION_OR_TOOL =
  /\b(?:search|browse|look\s+up|check\s+(?:online|the\s+web|my)|find\s+(?:me|near)|book|reserve|buy|purchase|send|email|message|call|schedule|cancel|deploy|commit|merge|fix|debug|run|execute|create|generate|draw|image|edit|rewrite|translate|summari[sz]e|upload|download)\b/i

const PRIVATE_OR_CONTEXTUAL =
  /\b(?:my|mine|our|ours|this|that|these|those|above|earlier|previous|attached|attachment|uploaded|file|document|repo|repository|github|account|calendar|email|conversation|history)\b/i

const PLATFORM_OR_META =
  /\b(?:signalboost|itmounts|chief\s+of\s+staff|cos|your\s+(?:model|llm|reasoner|system|platform)|what\s+model\s+are\s+you|which\s+model\s+do\s+you)\b/i

const COMPLEX_OR_SUBJECTIVE =
  /\b(?:why|explain|analy[sz]e|evaluate|compare|versus|vs\.?|pros\s+and\s+cons|recommend|best|worst|should\s+i|opinion|step\s+by\s+step|strategy|plan)\b/i

export function isSimpleKnowledgeQuestion(value: unknown): boolean {
  const prompt = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (!prompt || prompt.length > 220) return false
  const words = prompt.split(/\s+/).filter(Boolean)
  if (words.length > 32) return false
  if (!SIMPLE_QUESTION_PREFIX.test(prompt)) return false
  if (CURRENT_OR_VOLATILE.test(prompt)) return false
  if (ACTION_OR_TOOL.test(prompt)) return false
  if (PRIVATE_OR_CONTEXTUAL.test(prompt)) return false
  if (PLATFORM_OR_META.test(prompt)) return false
  if (COMPLEX_OR_SUBJECTIVE.test(prompt)) return false
  if ((prompt.match(/\?/g) || []).length > 1) return false
  return true
}
