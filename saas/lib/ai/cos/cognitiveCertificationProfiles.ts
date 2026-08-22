import {
  validateCognitiveSkillDraft,
  type CognitiveSkillDraft,
} from './cognitiveSkillCandidate.ts'
import type { CognitiveReasoningTriggerKind } from './cognitiveReasoningPatterns.ts'

export type CognitiveCertificationProfileKey = 'context_ambiguity_v1'

const CONTEXT_AMBIGUITY_TRIGGERS = new Set<CognitiveReasoningTriggerKind>([
  'deictic_predicate_question',
  'unresolved_referent_followup',
  'underspecified_comparison',
  'vague_temporal_reference',
])

const AMBIGUITY_SEMANTIC_MARKERS = [
  /\bambigu/i,
  /\breferent/i,
  /\bcontext/i,
  /\bbaseline/i,
  /\bscope\b/i,
  /\binterpret/i,
  /\bdeictic/i,
  /\btime window/i,
  /\btemporal/i,
]

function clean(value: unknown, max = 6000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(item => clean(item, 900)).filter(Boolean) : []
}

function triggerKinds(value: unknown): CognitiveReasoningTriggerKind[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(item => clean(item, 80) as CognitiveReasoningTriggerKind)
    .filter(item => CONTEXT_AMBIGUITY_TRIGGERS.has(item)))]
}

export function cognitiveDraftFromSkillRow(row: any): CognitiveSkillDraft {
  const procedure = row?.procedure && typeof row.procedure === 'object' ? row.procedure : {}
  return {
    title: clean(row?.title, 180),
    description: clean(row?.description, 1600),
    problemClass: clean(procedure.problemClass || row?.subject, 320),
    prerequisites: asStrings(procedure.prerequisites),
    procedureSteps: asStrings(procedure.procedureSteps || procedure.principles),
    discriminatingSignals: asStrings(procedure.discriminatingSignals),
    tools: asStrings(procedure.tools),
    observables: asStrings(procedure.observables),
    falsifiers: asStrings(procedure.falsifiers),
    commonFailureModes: asStrings(procedure.commonFailureModes),
    prohibitedActions: asStrings(procedure.prohibitedActions),
  }
}

function semanticMarkerCount(draft: CognitiveSkillDraft): number {
  const text = [
    draft.title,
    draft.description,
    draft.problemClass,
    ...draft.procedureSteps,
    ...draft.discriminatingSignals,
    ...draft.observables,
    ...draft.falsifiers,
  ].join(' ')
  return AMBIGUITY_SEMANTIC_MARKERS.filter(marker => marker.test(text)).length
}

/**
 * Profiles are test contracts, not promotion decisions. A profile only means SignalBoost has a
 * server-owned independent case family capable of examining this kind of procedure. It does not
 * make the candidate true, validated, or live-eligible.
 */
export function inferCertificationProfileForDraft(
  draft: CognitiveSkillDraft,
  triggers: string[],
): CognitiveCertificationProfileKey | null {
  const normalizedTriggers = triggerKinds(triggers)
  if (!normalizedTriggers.length) return null
  if (normalizedTriggers.length !== new Set(triggers).size) return null
  if (semanticMarkerCount(draft) < 2) return null
  return 'context_ambiguity_v1'
}

export function certificationProfileForSkill(row: any): CognitiveCertificationProfileKey | null {
  const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {}
  const explicit = clean(metadata.certification_profile, 120)
  if (explicit === 'context_ambiguity_v1') return explicit
  if (clean(row?.skill_key, 240) === 'reasoning.context_ambiguity_resolution.v1') return 'context_ambiguity_v1'

  const procedure = row?.procedure && typeof row.procedure === 'object' ? row.procedure : {}
  const configuredTriggers = [
    ...asStrings(procedure.reasoningTriggers),
    ...asStrings(metadata.reasoningTriggers),
  ]
  return inferCertificationProfileForDraft(cognitiveDraftFromSkillRow(row), configuredTriggers)
}

export type CuratedCandidateReview = {
  approved: boolean
  score: number
  reasons: string[]
  profile: CognitiveCertificationProfileKey
}

/**
 * Deterministic admission review for a curated certification profile. This is independent of the
 * model that wrote the candidate, but intentionally narrow: it verifies that the candidate is a
 * structurally valid, falsifiable member of a profile for which private independent cases exist.
 * The subsequent hidden understanding/practice/holdout results still decide lifecycle promotion.
 */
export function reviewCuratedCertificationCandidate(
  row: any,
  profile: CognitiveCertificationProfileKey,
): CuratedCandidateReview {
  const draft = cognitiveDraftFromSkillRow(row)
  const validation = validateCognitiveSkillDraft(draft)
  const reasons = [...validation.reasons]
  const procedure = row?.procedure && typeof row.procedure === 'object' ? row.procedure : {}
  const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {}
  const configuredTriggers = [...new Set([
    ...asStrings(procedure.reasoningTriggers),
    ...asStrings(metadata.reasoningTriggers),
  ])]
  const supportedTriggers = triggerKinds(configuredTriggers)

  if (profile !== 'context_ambiguity_v1') reasons.push('unsupported_certification_profile')
  if (!supportedTriggers.length) reasons.push('no_supported_reasoning_trigger')
  if (supportedTriggers.length !== configuredTriggers.length) reasons.push('mixed_or_unsupported_reasoning_triggers')
  if (semanticMarkerCount(draft) < 2) reasons.push('candidate_not_semantically_about_context_ambiguity')

  // Automatic certification must never bless a one-off literal/factual recipe. The feedback
  // generalizer already forbids those; this is an independent fail-closed backstop.
  const literalText = `${draft.title} ${draft.description} ${draft.problemClass}`
  if (/https?:\/\//i.test(literalText) || /\b(?:19|20)\d{2}\b/.test(literalText) || /\b\d{6,}\b/.test(literalText)) {
    reasons.push('one_off_literal_or_dated_candidate')
  }

  const uniqueReasons = [...new Set(reasons)]
  const score = uniqueReasons.length ? Math.max(0, 1 - uniqueReasons.length * 0.2) : 1
  return { approved: uniqueReasons.length === 0, score, reasons: uniqueReasons, profile }
}
