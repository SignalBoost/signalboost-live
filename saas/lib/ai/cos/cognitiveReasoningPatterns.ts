export type CognitiveReasoningTriggerKind =
  | 'deictic_predicate_question'
  | 'unresolved_referent_followup'
  | 'underspecified_comparison'
  | 'vague_temporal_reference'

export type CognitiveReasoningTrigger = {
  kind: CognitiveReasoningTriggerKind
  reason: string
}

const QUESTIONISH = /\?|^(?:who|what|when|where|why|how|is|are|am|do|does|did|can|could|should|would|will|which)\b/i
const DEICTIC_LOCATION = /\b(?:here|there|nearby|around here|around there|this place|this area|that place|that area)\b/i
const DEICTIC_PREDICATE = /^\s*(?:is|are|does|do|can|could|should|would|will)\b[\s\S]{0,140}\b(?:here|there|nearby|around here|around there|this place|this area|that place|that area)\b\s*\??\s*$/i
// Natural follow-ups commonly have both a question word and an auxiliary: "When did she leave?",
// "Where has it gone?", "Why would they do that?". Detect that grammar shape rather than a list
// of people or topics.
const REFERENT_PRONOUN = /^(?:and\s+)?(?:(?:when|where|why|how|what|who|which)\s+)?(?:(?:is|are|was|were|did|does|do|can|could|should|would|will|has|have|had)\s+)?(?:he|she|they|them|his|her|their|it|its|this|that|these|those)\b/i
const EXPLICIT_NAMED_REFERENT = /\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})+\b/
const COMPARATIVE = /\b(?:better|worse|best|worst|faster|slower|safer|riskier|cheaper|more expensive|easier|harder|stronger|weaker|higher|lower|larger|smaller|more|less)\b/i
const COMPARISON_BASELINE = /\b(?:than|compared (?:with|to)|versus|vs\.?|relative to|between\s+\S+\s+and\s+\S+)\b/i
const VAGUE_TEMPORAL = /\b(?:soon|recently|lately|a while ago|in a while|these days|nowadays|at some point)\b/i

function compact(value: unknown, max = 1200): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

/**
 * Detect structural reasoning conditions, not topic keywords. These triggers never answer a
 * question themselves; they only make an already-validated procedural skill eligible for
 * selection. That lets future learned rules generalize across wording without granting a user
 * correction automatic authority.
 */
export function detectCognitiveReasoningTriggers(prompt: string): CognitiveReasoningTrigger[] {
  const text = compact(prompt)
  if (!text || !QUESTIONISH.test(text)) return []

  const triggers: CognitiveReasoningTrigger[] = []
  if (DEICTIC_LOCATION.test(text) && DEICTIC_PREDICATE.test(text)) {
    triggers.push({
      kind: 'deictic_predicate_question',
      reason: 'Question predicates a condition on a deictic location whose referent or comparison frame may require context.',
    })
  }

  if (text.length <= 180 && REFERENT_PRONOUN.test(text) && !EXPLICIT_NAMED_REFERENT.test(text)) {
    triggers.push({
      kind: 'unresolved_referent_followup',
      reason: 'Short follow-up contains a pronoun or demonstrative whose referent may come from conversation context.',
    })
  }

  if (COMPARATIVE.test(text) && !COMPARISON_BASELINE.test(text)) {
    triggers.push({
      kind: 'underspecified_comparison',
      reason: 'Comparative language appears without an explicit comparison baseline.',
    })
  }

  if (VAGUE_TEMPORAL.test(text)) {
    triggers.push({
      kind: 'vague_temporal_reference',
      reason: 'Temporal wording is relative or vague and may require a concrete reference window.',
    })
  }

  return [...new Map(triggers.map(trigger => [trigger.kind, trigger])).values()]
}

const ALLOWED_TRIGGER_KINDS = new Set<CognitiveReasoningTriggerKind>([
  'deictic_predicate_question',
  'unresolved_referent_followup',
  'underspecified_comparison',
  'vague_temporal_reference',
])

export function cognitiveSkillReasoningTriggerKinds(row: {
  procedure?: unknown
  metadata?: unknown
}): CognitiveReasoningTriggerKind[] {
  const procedure = row.procedure && typeof row.procedure === 'object' ? row.procedure as Record<string, unknown> : {}
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {}
  const raw = [
    ...(Array.isArray(procedure.reasoningTriggers) ? procedure.reasoningTriggers : []),
    ...(Array.isArray(metadata.reasoningTriggers) ? metadata.reasoningTriggers : []),
  ]
  return [...new Set(raw
    .map(value => compact(value, 80) as CognitiveReasoningTriggerKind)
    .filter((value): value is CognitiveReasoningTriggerKind => ALLOWED_TRIGGER_KINDS.has(value)))]
}

export function matchingCognitiveReasoningTriggers(
  detected: CognitiveReasoningTrigger[],
  configured: CognitiveReasoningTriggerKind[],
): CognitiveReasoningTriggerKind[] {
  const active = new Set(detected.map(trigger => trigger.kind))
  return configured.filter(kind => active.has(kind))
}
