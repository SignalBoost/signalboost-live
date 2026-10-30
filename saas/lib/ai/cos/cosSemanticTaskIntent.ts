// saas/lib/ai/cos/cosSemanticTaskIntent.ts
//
// Model-owned task-intent classification: the "intent & context" step of a COS turn. It decides which lane serves
// the request (advice/answer, writing, picture, file, live lookup) and keeps the stale-world freshness gate from
// hijacking a request whose real task is interpretation of supplied language/context, or from attempting a live
// lookup before essential ambiguity has been resolved. Word rules may only suggest a lane; a special lane runs only
// when this judge confirms it (see cosTurnIntent.ts). This module does not establish facts and cannot weaken
// freshness for a sufficiently specified request that actually asks COS to verify the external world.

export type CosSemanticTaskMode =
  | 'contextual_interpretation'
  | 'clarification_required'
  | 'external_fact_verification'
  | 'general_reasoning'
  | 'content_generation'
  | 'visual_generation'
  | 'file_generation'
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
  'visual_generation',
  'file_generation',
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

/**
 * The judge found a task answered from material the user supplied, needing no outside-world facts: interpreting
 * supplied language, or reasoning over supplied facts (an incident report, a dataset, a scenario with deliverables).
 * Either overrides the word rules that flagged incidental dates, times or names as current facts. Production
 * 2026-10-28: a hypothetical infrastructure incident with UTC timestamps was judged general_reasoning over supplied
 * facts, no external facts required, and was still refused as an unverifiable current fact because only
 * contextual_interpretation counted. The judge stays fail-safe: unavailable or unsure, nothing is suppressed.
 */
export function semanticIntentIsSuppliedContextReasoning(intent: CosSemanticTaskIntent | null): boolean {
  return Boolean(
    intent
      && (intent.mode === 'contextual_interpretation' || intent.mode === 'general_reasoning')
      && intent.suppliedContextPrimary
      && !intent.externalFactsRequired
      && intent.confidence >= 0.72,
  )
}

export function semanticIntentSuppressesFreshness(intent: CosSemanticTaskIntent | null): boolean {
  if (semanticIntentRequiresClarification(intent)) return true
  if (semanticIntentIsSelfContainedContentGeneration(intent)) return true
  return semanticIntentIsSuppliedContextReasoning(intent)
}

/**
 * The judge found a deliverable to produce (a letter, advice, an analysis) that needs outside-world facts. The live
 * lookup gathers those facts, and COS then writes the whole deliverable from them; the fact-only answer lane, which
 * keeps only cited sentences, cannot write a letter. Production 2026-10-30: a letter to the user's CDO about extending
 * retirement past 65 was refused with "the drafted answer did not meet the verification requirement".
 */
export function semanticIntentComposesWithEvidence(intent: CosSemanticTaskIntent | null): boolean {
  return Boolean(
    intent
      && (intent.mode === 'content_generation' || intent.mode === 'general_reasoning')
      && intent.externalFactsRequired
      && intent.confidence >= 0.72,
  )
}

/** The judge's positive live-fact finding: the turn needs current outside-world facts verified live. */
export function semanticIntentRequiresFreshness(intent: CosSemanticTaskIntent | null): boolean {
  return Boolean(
    intent
      && (intent.mode === 'external_fact_verification' || intent.mode === 'content_generation')
      && intent.externalFactsRequired
      && intent.confidence >= 0.72,
  )
}

/**
 * The lanes a word rule can only suggest. Production 2026-10-28: a pasted State Department cable with the user's
 * question about his retirement options was sent to the writing setup (reasoning off) because it contained drafting
 * words, and to the picture generator because "at any point" was typo-corrected to "paint". The judge read the whole
 * request; these confirm a suggested lane only when the judge positively found that deliverable.
 */
export function semanticIntentConfirmsWriting(intent: CosSemanticTaskIntent | null): boolean {
  return Boolean(intent && intent.mode === 'content_generation' && intent.confidence >= 0.72)
}

export function semanticIntentConfirmsPicture(intent: CosSemanticTaskIntent | null): boolean {
  return Boolean(intent && intent.mode === 'visual_generation' && intent.confidence >= 0.72)
}

export function semanticIntentConfirmsFile(intent: CosSemanticTaskIntent | null): boolean {
  return Boolean(intent && intent.mode === 'file_generation' && intent.confidence >= 0.72)
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

  // Loaded lazily: the reasoner's module graph uses path aliases the plain test runner cannot resolve, and the lane
  // confirmations above must stay unit-testable.
  const { callCosReasoner } = await import('./cosReasoner.ts')
  const reasoned = await callCosReasoner({
    usageContext: { feature: 'cos_interactive_answer', purpose: 'semantic_task_intent' },
    temperature: 0,
    maxTokens: 360,
    disableThinking: true,
    timeoutMs: 8_000,
    jsonObject: true,
    systemPrompt: [
      'You are the COS semantic task-intent judge. Classify what help the user is actually asking for before any evidence workflow is selected.',
      'Use neural semantic understanding of the whole request and conversation context. Do not classify by keywords, regex patterns, named entities, dates, or isolated topical words.',
      'Return ONLY strict JSON: {"mode":"contextual_interpretation|clarification_required|external_fact_verification|general_reasoning|content_generation|visual_generation|file_generation|external_action|other","confidence":0.0,"suppliedContextPrimary":true|false,"externalFactsRequired":true|false}.',
      'clarification_required means an essential scope, referent, target, baseline, location, time window, object, or other piece of context is genuinely missing; at least two plausible interpretations remain; and choosing between them would materially change the correct answer or action.',
      'Before choosing clarification_required, use the supplied conversation context. Do not ask the user for information that the conversation already resolves, that can be safely inferred, that has an obvious low-risk default, or that a permitted retrieval can establish without guessing.',
      'A broad request is not automatically ambiguous. If a useful broad answer is possible, if the user clearly asked for an overview, or if a reasonable assumption would not materially change correctness, do not choose clarification_required.',
      'Structural ambiguity is domain-general: examples include an unresolved pronoun or deictic referent, a comparison with no baseline, a local or point-specific condition requested over a geography too broad to have one meaningful current value, or a task whose target could reasonably be one of several materially different objects.',
      'When clarification_required applies, freshness must wait until the missing context is resolved. The eventual task may still require external facts; externalFactsRequired should describe that eventual task rather than forcing a premature lookup now.',
      'general_reasoning includes incident reports, hypothetical scenarios, and investigations where all observations are supplied by the user and the task is to infer, rank, and propose checks. Treat supplied observations as the evidentiary boundary: suppliedContextPrimary=true and externalFactsRequired=false unless the user explicitly asks to investigate the actual outside world.',
      'contextual_interpretation means the user wants help understanding supplied or conversational language: meaning, tone, implication, subtext, social intent, what a person likely meant, whether wording sounds positive/negative, translation-with-meaning, or interpretation of a pasted message. The passage may mention real people, dates, offices, events, or current facts; those mentions do NOT turn the task into external verification when the user is asking what the supplied language means.',
      'external_fact_verification means the request is sufficiently specified and the answer requires establishing whether something about the outside world is true, current, accurate, still the case, supported by sources, or independently verifiable. Questions such as “is this claim true?”, “is that still the current rule?”, “prove it”, or “check whether this email is accurate” belong here when the object of verification is clear.',
      'general_reasoning means the user wants analysis, diagnosis, ranking, planning or explanation performed on facts, data or a scenario they supplied (an incident report, a log excerpt, a case, a dataset, a hypothetical). Timestamps, dates, place names or system names inside the supplied material do NOT make it an outside-world fact to verify.',
      'Advice, a recommendation, an opinion or a decision about the user\'s own situation is general_reasoning when it rests on material the user supplied, even when that material contains drafts, emails or a previous answer.',
      'content_generation means the deliverable the user asks COS to produce is new or rewritten text: an email, letter, post, summary, translation or an edit of their own text. Text that merely appears in pasted material is not a request to write.',
      'When requested writing depends on establishing an outside-world fact, such as whether a legal entitlement or regulation exists, choose content_generation with externalFactsRequired=true. A writing deliverable does not make legal, medical, financial, policy, or eligibility claims self-contained. When the user requests both a draft and advice, preserve both deliverables.',
      'visual_generation means the deliverable the user asks COS to produce is a still picture: an image, drawing, illustration, logo, poster or photo-like render. Visual words inside pasted material, idioms, or a request to explain or write about a visual are not visual_generation.',
      'file_generation means the user asks COS to produce a downloadable file (such as a PDF or a text file) as the deliverable.',
      'For visual_generation and file_generation set externalFactsRequired=false unless the content of that deliverable needs current outside facts.',
      'For contextual_interpretation and general_reasoning, set suppliedContextPrimary=true when the task can be answered from text/context the user supplied, and externalFactsRequired=false unless the user separately asks to verify an outside-world claim or the supplied material is insufficient without current outside facts.',
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