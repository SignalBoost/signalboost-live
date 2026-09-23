// saas/lib/ai/cos/simpleKnowledgeFastPath.ts
//
// FAST STABLE-KNOWLEDGE LANE.
//
// This lane exists for short, self-contained questions whose answer does not require live data,
// private context, tools, retrieval, specialists, memory, or an external action. It deliberately
// fails fast instead of falling through into the full COS pipeline after a provider timeout.

import { callLocalModel } from '../local-inference.ts'

export const SIMPLE_KNOWLEDGE_FAST_TIMEOUT_MS = 7_000

const SIMPLE_QUESTION_PREFIX =
  /^(?:what(?:'s|\s+is|\s+are|\s+was|\s+were)?|who(?:'s|\s+is|\s+was)?|where(?:'s|\s+is|\s+was)?|when(?:'s|\s+is|\s+was|\s+did)?|which|how\s+(?:many|much|old|long|far|tall|high|deep))\b/i

const CURRENT_OR_VOLATILE =
  /\b(?:current|currently|today|tonight|tomorrow|yesterday|latest|recent|recently|now|right\s+now|live|this\s+(?:week|month|year)|weather|forecast|temperature|score|standings?|ranking|polls?|election|price|cost|stock|market|exchange\s+rate|interest\s+rate|availability|open\s+now|opening\s+hours?|schedule|release\s+date|version|population|gdp|president|prime\s+minister|governor|mayor|ceo|minister|officeholder)\b/i

const ACTION_OR_TOOL =
  /\b(?:search|browse|look\s+up|check\s+(?:online|the\s+web|my)|find\s+(?:me|near)|book|reserve|buy|purchase|send|email|message|call|schedule|cancel|deploy|commit|merge|fix|debug|run|execute|create|generate|draw|image|edit|rewrite|translate|summari[sz]e|upload|download)\b/i

const PRIVATE_OR_CONTEXTUAL =
  /\b(?:my|mine|our|ours|this|that|these|those|above|earlier|previous|attached|attachment|uploaded|file|document|repo|repository|github|account|calendar|email|conversation|history)\b/i

const PLATFORM_OR_META =
  /\b(?:signalboost|itmounts|chief\s+of\s+staff|\bcos\b|your\s+(?:model|llm|reasoner|system|platform)|what\s+model\s+are\s+you|which\s+model\s+do\s+you)\b/i

const COMPLEX_OR_SUBJECTIVE =
  /\b(?:why|explain|analy[sz]e|evaluate|compare|versus|\bvs\.?\b|pros\s+and\s+cons|recommend|best|worst|should\s+i|opinion|step\s+by\s+step|strategy|plan)\b/i

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

function timeoutMs(): number {
  const parsed = Number(process.env.COS_SIMPLE_KNOWLEDGE_TIMEOUT_MS || SIMPLE_KNOWLEDGE_FAST_TIMEOUT_MS)
  return Number.isFinite(parsed)
    ? Math.max(3_000, Math.min(8_500, Math.floor(parsed)))
    : SIMPLE_KNOWLEDGE_FAST_TIMEOUT_MS
}

export async function answerSimpleKnowledgeQuestion(prompt: string): Promise<string | null> {
  if (!isSimpleKnowledgeQuestion(prompt)) return null

  const text = await callLocalModel({
    prompt: String(prompt || '').trim(),
    systemPrompt: [
      'Answer the user\'s short, stable general-knowledge question directly and concisely.',
      'Do not browse, retrieve external data, use tools, inspect memory, delegate to an agent, or perform actions.',
      'If the question actually depends on current/live information, private context, or external action, return exactly __NOT_STABLE_FACT__.',
      'For an ordinary factual answer, give only the answer needed; usually one or two sentences.',
    ].join(' '),
    maxTokens: 180,
    temperature: 0.1,
    disableThinking: true,
    timeoutMs: timeoutMs(),
    allowConfiguredFallback: false,
    persistUsage: false,
    usageContext: { feature: 'cos_simple_knowledge', purpose: 'fast_stable_fact' },
  }).catch(() => null)

  const answer = String(text || '').trim()
  if (!answer || answer === '__NOT_STABLE_FACT__') return null
  return answer
}
