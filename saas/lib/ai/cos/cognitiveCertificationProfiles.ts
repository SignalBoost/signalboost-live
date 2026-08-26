import {
  validateCognitiveSkillDraft,
  type CognitiveSkillDraft,
} from './cognitiveSkillCandidate.ts'
import type { CognitiveReasoningTriggerKind } from './cognitiveReasoningPatterns.ts'

export type CognitiveCertificationProfileKey =
  | 'context_ambiguity_v1'
  | 'performance_regression_diagnosis_v1'
  | 'architecture_discovery_v1'

const PROFILE_KEYS = new Set<CognitiveCertificationProfileKey>([
  'context_ambiguity_v1',
  'performance_regression_diagnosis_v1',
  'architecture_discovery_v1',
])

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

function normalizedUnique(values: string[]): string[] {
  return [...new Set(values.map(value => clean(value, 80)).filter(Boolean))]
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

function semanticText(draft: CognitiveSkillDraft): string {
  return [
    draft.title,
    draft.description,
    draft.problemClass,
    ...draft.prerequisites,
    ...draft.procedureSteps,
    ...draft.discriminatingSignals,
    ...draft.tools,
    ...draft.observables,
    ...draft.falsifiers,
    ...draft.commonFailureModes,
    ...draft.prohibitedActions,
  ].join(' ')
}

function ambiguityMarkerCount(draft: CognitiveSkillDraft): number {
  const text = semanticText(draft)
  return AMBIGUITY_SEMANTIC_MARKERS.filter(marker => marker.test(text)).length
}

function performanceRegressionProfileEligible(draft: CognitiveSkillDraft): boolean {
  const text = semanticText(draft)
  return /\b(?:performance|latenc|response time)/i.test(text)
    && /\b(?:percentile|distribution|p50|p90|p95|p99|median|tail latency)/i.test(text)
    && /\b(?:regress|degrad|diverg|maintenance|contention|post-maintenance)/i.test(text)
    && /\b(?:observable|metric|trace|histogram|wait|query plan|execution plan|telemetry)/i.test(text)
    && /\b(?:falsif|rule out|ruling out|disprov|contradict)/i.test(text)
}

function architectureDiscoveryProfileEligible(draft: CognitiveSkillDraft): boolean {
  const text = semanticText(draft)
  return /\b(?:architect|system component|component discovery|architecture discovery)/i.test(text)
    && /\b(?:entry point|route|gateway|endpoint|transport layer)/i.test(text)
    && /\b(?:data flow|request flow|call flow|relationship|trace)/i.test(text)
    && /\b(?:permission|read-only|tool access|execution permission|mutation restriction)/i.test(text)
    && /\b(?:file path|configuration|config flag|artifact|code path|observable)/i.test(text)
}

/**
 * Profiles are test contracts, not promotion decisions. A profile only means SignalBoost has a
 * server-owned independent case family capable of examining this kind of procedure. It does not
 * make the candidate true, validated, or live-eligible.
 *
 * Ambiguity profiles opt in through bounded structural trigger kinds. Domain diagnostic profiles
 * deliberately require no ambiguity triggers and instead use a strict multi-signal structural
 * classifier. This keeps private certification narrow and prevents a generic technical recipe from
 * self-certifying merely because it shares one keyword with a supported family.
 */
export function inferCertificationProfileForDraft(
  draft: CognitiveSkillDraft,
  triggers: string[],
): CognitiveCertificationProfileKey | null {
  const configuredTriggers = normalizedUnique(triggers)
  const normalizedTriggers = triggerKinds(configuredTriggers)

  if (configuredTriggers.length) {
    if (!normalizedTriggers.length) return null
    if (normalizedTriggers.length !== configuredTriggers.length) return null
    if (ambiguityMarkerCount(draft) < 2) return null
    return 'context_ambiguity_v1'
  }

  if (performanceRegressionProfileEligible(draft)) return 'performance_regression_diagnosis_v1'
  if (architectureDiscoveryProfileEligible(draft)) return 'architecture_discovery_v1'
  return null
}

export function certificationProfileForSkill(row: any): CognitiveCertificationProfileKey | null {
  const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {}
  const explicit = clean(metadata.certification_profile, 120) as CognitiveCertificationProfileKey
  if (PROFILE_KEYS.has(explicit)) return explicit
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
  const configuredTriggers = normalizedUnique([
    ...asStrings(procedure.reasoningTriggers),
    ...asStrings(metadata.reasoningTriggers),
  ])
  const supportedTriggers = triggerKinds(configuredTriggers)

  if (!PROFILE_KEYS.has(profile)) {
    reasons.push('unsupported_certification_profile')
  } else if (profile === 'context_ambiguity_v1') {
    if (!supportedTriggers.length) reasons.push('no_supported_reasoning_trigger')
    if (supportedTriggers.length !== configuredTriggers.length) reasons.push('mixed_or_unsupported_reasoning_triggers')
    if (ambiguityMarkerCount(draft) < 2) reasons.push('candidate_not_semantically_about_context_ambiguity')
  } else if (profile === 'performance_regression_diagnosis_v1') {
    if (configuredTriggers.length) reasons.push('unexpected_reasoning_triggers_for_profile')
    if (!performanceRegressionProfileEligible(draft)) reasons.push('candidate_not_structurally_about_performance_regression')
  } else if (profile === 'architecture_discovery_v1') {
    if (configuredTriggers.length) reasons.push('unexpected_reasoning_triggers_for_profile')
    if (!architectureDiscoveryProfileEligible(draft)) reasons.push('candidate_not_structurally_about_architecture_discovery')
  }

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
