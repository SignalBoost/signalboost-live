// saas/lib/ai/cos/simpleKnowledgeFastPath.ts
//
// FAST STABLE-KNOWLEDGE LANE.
//
// This lane exists for short, self-contained questions whose answer does not require live data,
// private context, tools, retrieval, specialists, memory, or an external action. It deliberately
// fails fast instead of falling through into the full COS pipeline after a provider timeout.

import { callLocalModel } from '../local-inference.ts'

export const SIMPLE_KNOWLEDGE_FAST_TIMEOUT_MS = 7_000

import { isSimpleKnowledgeQuestion } from './simpleKnowledgeIntent.ts'
export { isSimpleKnowledgeQuestion } from './simpleKnowledgeIntent.ts'

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
