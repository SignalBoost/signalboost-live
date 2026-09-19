// saas/lib/ai/cos/cosSemanticTaskIntent.ts
//
// Model-owned task-intent classification used only to prevent the stale-world freshness gate from
// hijacking a request whose real task is interpretation of supplied language/context, or from
// attempting a live lookup before essential ambiguity has been resolved. This module does not
// establish facts and cannot weaken freshness for a sufficiently specified request that actually
// asks COS to verify the external world.

import { callCosReasoner } from './cosReasoner.ts'

export type CosSemanticTaskMode =
  | 'contextual_interpretation'
  | 'clarification_required'
  | 'external_fact_verification'
  | 'general_reasoning'
  | 'content_generation'
  | 'external_action'
  | 'other'

export type CosSemanticTaskIntent = Readonly<{
  mode: CosSemanticTaskMode
  confidence: number
  suppliedContextPrimary: boolean
  externalFactsRequired: boolean
}>

const VALID_MODES = new Set<CosSemanticTaskMode>([
  'contextual_interpretation',
  'clarification_required',
  'external_fact_verification',
  'general_reasoning',
  'content_generation',
  'external_action',
  'other',
])

export function parseCosSemanticTaskIntent(raw: string): CosSemanticTaskIntent | null {
  const text = String(raw || '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
    const mode = String(parsed.mode || '') as CosSemanticTaskMode
    if (!VALID_MODES.has(mode)) return null
    if (typeof parsed.suppliedContextPrimary !== 'boolean' || typeof parsed.externalFactsRequired !== 'boolean') return null
    const value = Number(parsed.confidence)
    if (!Number.isFinite(value)) return null
    return {
      mode,
      confidence: Math.max(0, Math.min(1, value)),
      suppliedContextPrimary: parsed.suppliedContextPrimary,
      externalFactsRequired: parsed.externalFactsRequired,
    }
  } catch {
    return null
  }
}

export function semanticIntentRequiresClarification(intent: CosSemanticTaskIntent | null): boolean {
  return Boolean(intent && intent.mode === 'clarification_required' && intent.confidence >= 0.72)
}

export function semanticIntentIsSelfContainedContentGeneration(intent: CosSemanticTaskIntent | null): boolean {
  return Boolean(
    intent
      && intent.mode === 'content_generation'
      && !intent.externalFactsRequired
      && intent.confidence >= 0.72,
  )
}

export function semanticIntentSuppressesFreshness(intent: CosSemanticTaskIntent | null): boolean {
  if (semanticIntentRequiresClarification(intent)) return true
  if (semanticIntentIsSelfContainedContentGeneration(intent)) return true
  return Boolean(
    intent
      && intent.mode === 'contextual_interpretation'
      && intent.suppliedContextPrimary
      && !intent.externalFactsRequired
      && intent.confidence >= 0.72,
  )
}

export async function classifyCosSemanticTaskIntent(args: {
  input: string
  language?: string | null
  previousUserContext?: string | null
  previousAssistant?: string | null
}): Promise<CosSemanticTaskIntent | null> {
  const input = String(args.input || '').trim()
  if (!input) return null

  const priorUser = String(args.previousUserContext || '').trim().slice(0, 4_000)
  const priorAssistant = String(args.previousAssistant || '').trim().slice(0, 4_000)

  const reasoned = await callCosReasoner({
    temperature: 0,
    maxTokens: 360,
    systemPrompt: [
      'You are the COS semantic task-intent judge. Classify what help the user is actually asking for before any evidence workflow is selected.',
      'Use neural semantic understanding of the whole request and conversation context. Do not classify by keywords, regex patterns, named entities, dates, or isolated topical words.',
      'Return ONLY strict JSON: {"mode":"contextual_interpretation|clarification_required|external_fact_verification|general_reasoning|content_generation|external_action|other","confidence":0.0,"suppliedContextPrimary":true|false,"externalFactsRequired":true|false}.',
      'clarification_required means an essential scope, referent, target, baseline, location, time window, object, or other piece of context is genuinely missing; at least two plausible interpretations remain; and choosing between them would materially change the correct answer or action.',
      'Before choosing clarification_required, use the supplied conversation context. Do not ask the user for information that the conversation already resolves, that can be safely inferred, that has an obvious low-risk default, or that a permitted retrieval can establish without guessing.',
      'A broad request is not automatically ambiguous. If a useful broad answer is possible, if the user clearly asked for an overview, or if a reasonable assumption would not materially change correctness, do not choose clarification_required.',
      'Structural ambiguity is domain-general: examples include an unresolved pronoun or deictic referent, a comparison with no baseline, a local or point-specific condition requested over a geography too broad to have one meaningful current value, or a task whose target could reasonably be one of several materially different objects.',
      'When clarification_required applies, freshness must wait until the missing context is resolved. The eventual task may still require external facts; externalFactsRequired should describe that eventual task rather than forcing a premature lookup now.',
      'contextual_interpretation means the user wants help understanding supplied or conversational language: meaning, tone, implication, subtext, social intent, what a person likely meant, whether wording sounds positive/negative, translation-with-meaning, or interpretation of a pasted message. The passage may mention real people, dates, offices, events, or current facts; those mentions do NOT turn the task into external verification when the user is asking what the supplied language means.',
      'external_fact_verification means the request is sufficiently specified and the answer requires establishing whether something about the outside world is true, current, accurate, still the case, supported by sources, or independently verifiable. Questions such as “is this claim true?”, “is that still the current rule?”, “prove it”, or “check whether this email is accurate” belong here when the object of verification is clear.',
      'For contextual_interpretation, set suppliedContextPrimary=true when the meaning can be answered from text/context the user supplied, and externalFactsRequired=false unless the user separately asks to verify an outside-world claim.',
      'Infer intent equivalently in every language. The language of the request must not change the classification standard.',
      'When deciding between clarification_required and external_fact_verification, choose clarification_required only when the missing context is essential and materially outcome-changing; otherwise prefer external_fact_verification so freshness protection fails safe.',
      'When ambiguous between interpretation and verification, prefer external_fact_verification so freshness protection fails safe.',
    ].join(' '),
    prompt: [
      `CURRENT USER REQUEST:\n${input}`,
      priorUser ? `PREVIOUS USER CONTEXT:\n${priorUser}` : '',
      priorAssistant ? `PREVIOUS ASSISTANT CONTEXT:\n${priorAssistant}` : '',
      args.language ? `USER LANGUAGE HINT: ${args.language}` : '',
      'Classify the task the user wants performed, not merely the subjects mentioned inside quoted or pasted material.',
    ].filter(Boolean).join('\n\n'),
  }).catch(error => {
    console.warn('[cos-semantic-task-intent] reasoner unavailable', error)
    return null
  })

  return reasoned?.text ? parseCosSemanticTaskIntent(reasoned.text) : null
}