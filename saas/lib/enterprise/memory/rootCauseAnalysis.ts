// Grounded root-cause hypothesis ranking from correlated Enterprise Evidence timelines.
// This module ranks observed candidate causes; it never invents events, claims certainty, or executes repairs.

import type { EvidenceCorrelationLink } from './evidenceCorrelation'
import type { EvidenceTimeline, EvidenceTimelineEntry } from './evidenceTimeline'

export type RootCauseHypothesis = Readonly<{
  eventId: string
  summary: string
  confidence: number
  supportingEvidence: readonly string[]
  contradictingEvidence: readonly string[]
  relatedEventIds: readonly string[]
}>

export type RootCauseAnalysis = Readonly<{
  organizationId: string
  targetEventId: string
  status: 'supported' | 'insufficient_evidence'
  primaryHypothesis: RootCauseHypothesis | null
  alternateHypotheses: readonly RootCauseHypothesis[]
  unknowns: readonly string[]
}>

const CAUSE_TYPES = new Set<EvidenceTimelineEntry['type']>([
  'deployment.failed',
  'deployment.succeeded',
  'repository.analysis_completed',
  'security.finding_recorded',
])

const EFFECT_TYPES = new Set<EvidenceTimelineEntry['type']>([
  'browser.observation_recorded',
  'incident.resolved',
  'supervisor.diagnosis_generated',
])

const REASON_WEIGHTS: Readonly<Record<string, number>> = Object.freeze({
  correlation_id: 1,
  incident_id: 0.95,
  deployment_id: 0.95,
  commit_sha: 0.9,
  session_id: 0.8,
  campaign_id: 0.75,
  repository: 0.55,
  time_proximity: 0.15,
})

function clamp01(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.min(1, Math.max(0, numeric))
}

function label(entry: EvidenceTimelineEntry): string {
  const id = entry.entities.deploymentId
    || entry.entities.commitSha
    || entry.entities.incidentId
    || entry.entities.repository
    || entry.eventId
  return `${entry.type} (${id})`
}

function linksForPair(
  links: readonly EvidenceCorrelationLink[],
  leftEventId: string,
  rightEventId: string,
): readonly EvidenceCorrelationLink[] {
  return links.filter(link =>
    (link.leftEventId === leftEventId && link.rightEventId === rightEventId)
    || (link.leftEventId === rightEventId && link.rightEventId === leftEventId),
  )
}

export function analyzeEnterpriseEvidenceRootCause(
  timeline: EvidenceTimeline,
  links: readonly EvidenceCorrelationLink[],
  options: { targetEventId?: string; maxHypotheses?: number; minimumConfidence?: number } = {},
): RootCauseAnalysis {
  const maxHypotheses = options.maxHypotheses ?? 5
  const minimumConfidence = options.minimumConfidence ?? 0.45
  if (!Number.isSafeInteger(maxHypotheses) || maxHypotheses < 1 || maxHypotheses > 20) {
    throw new Error('Root cause maxHypotheses must be an integer from 1 to 20.')
  }
  if (!Number.isFinite(minimumConfidence) || minimumConfidence < 0 || minimumConfidence > 1) {
    throw new Error('Root cause minimumConfidence must be from 0 to 1.')
  }

  const target = options.targetEventId
    ? timeline.entries.find(entry => entry.eventId === options.targetEventId)
    : [...timeline.entries].reverse().find(entry => EFFECT_TYPES.has(entry.type))

  if (!target) {
    return Object.freeze({
      organizationId: timeline.organizationId,
      targetEventId: options.targetEventId || '',
      status: 'insufficient_evidence',
      primaryHypothesis: null,
      alternateHypotheses: Object.freeze([]),
      unknowns: Object.freeze(['No observed target effect event was available for root-cause analysis.']),
    })
  }

  const targetTime = Date.parse(target.occurredAt)
  const hypotheses = timeline.entries
    .filter(entry => entry.eventId !== target.eventId)
    .filter(entry => CAUSE_TYPES.has(entry.type))
    .filter(entry => Date.parse(entry.occurredAt) <= targetTime)
    .map(entry => {
      const pairLinks = linksForPair(links, entry.eventId, target.eventId)
      const reasons = [...new Set(pairLinks.flatMap(link => link.reasons))]
      const strongestReason = reasons.reduce((max, reason) => Math.max(max, REASON_WEIGHTS[reason] || 0), 0)
      const linkConfidence = pairLinks.reduce((max, link) => Math.max(max, clamp01(link.confidence)), 0)
      const elapsedMs = Math.max(0, targetTime - Date.parse(entry.occurredAt))
      const proximity = Math.max(0, 1 - elapsedMs / (60 * 60 * 1000))
      const evidenceConfidence = (clamp01(entry.confidence) + clamp01(target.confidence)) / 2
      const confidence = clamp01(strongestReason * 0.45 + linkConfidence * 0.3 + proximity * 0.1 + evidenceConfidence * 0.15)

      const supportingEvidence = reasons
        .filter(reason => reason !== 'time_proximity')
        .map(reason => `Shared ${reason.replaceAll('_', ' ')}.`)
      if (reasons.includes('time_proximity')) supportingEvidence.push(`Observed ${elapsedMs} ms before the target event.`)

      const contradictingEvidence: string[] = []
      if (!pairLinks.length) contradictingEvidence.push('No direct correlation link connects this event to the target event.')
      if (elapsedMs > 60 * 60 * 1000) contradictingEvidence.push('The candidate occurred more than one hour before the target event.')
      if (entry.type === 'deployment.succeeded') contradictingEvidence.push('The deployment event itself was recorded as successful.')

      return Object.freeze({
        eventId: entry.eventId,
        summary: `${label(entry)} is a possible contributor to ${label(target)}.`,
        confidence: Math.round(confidence * 1000) / 1000,
        supportingEvidence: Object.freeze(supportingEvidence),
        contradictingEvidence: Object.freeze(contradictingEvidence),
        relatedEventIds: Object.freeze([...new Set(pairLinks.flatMap(link => [link.leftEventId, link.rightEventId]).filter(id => id !== entry.eventId))].sort()),
      })
    })
    .filter(hypothesis => hypothesis.confidence >= minimumConfidence)
    .sort((a, b) => b.confidence - a.confidence || a.eventId.localeCompare(b.eventId))
    .slice(0, maxHypotheses)

  if (!hypotheses.length) {
    return Object.freeze({
      organizationId: timeline.organizationId,
      targetEventId: target.eventId,
      status: 'insufficient_evidence',
      primaryHypothesis: null,
      alternateHypotheses: Object.freeze([]),
      unknowns: Object.freeze([
        'No observed candidate cause met the minimum evidence threshold.',
        'Correlation does not establish causation; additional verification is required.',
      ]),
    })
  }

  return Object.freeze({
    organizationId: timeline.organizationId,
    targetEventId: target.eventId,
    status: 'supported',
    primaryHypothesis: hypotheses[0],
    alternateHypotheses: Object.freeze(hypotheses.slice(1)),
    unknowns: Object.freeze([
      'Correlation does not establish causation; the primary hypothesis requires verification.',
      'Missing agent observations may change the ranking.',
    ]),
  })
}
