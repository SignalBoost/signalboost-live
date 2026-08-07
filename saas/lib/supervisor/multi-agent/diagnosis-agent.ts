import type { SupervisorIncident } from '../incident-schema.ts'
import type { CognitiveContext } from '../cognitive/types.ts'
import type { DiagnosisAgentPort, DiagnosisCategory, DiagnosisHypothesis, DiagnosisReport } from './types.ts'

const patterns: Array<[DiagnosisCategory, RegExp]> = [
  ['availability', /\b(502|503|504|down|unavailable|unreachable|connection refused|health.?check)\b/i],
  ['deployment', /\b(deploy|deployment|rollout|release|build failed|revision)\b/i],
  ['saturation', /\b(memory|heap|cpu|disk|quota|throttl|rate.?limit|oom|capacity|pressure|backlog)\b/i],
  ['latency', /\b(latency|slow|p9[59]|response time|duration|timeout)\b/i],
  ['errors', /\b(error rate|5xx|4xx|exception|crash|panic|failure rate)\b/i],
  ['data_freshness', /\b(stale|missing data|lag|behind|no recent|not draining)\b/i],
]

function categoryFor(incident: SupervisorIncident, context: CognitiveContext): DiagnosisCategory {
  const text = `${incident.errorMessage} ${incident.errorCode ?? ''} ${context.evidence.map(item => item.summary).join(' ')}`
  for (const [category, pattern] of patterns) if (pattern.test(text)) return category
  return 'unclassified'
}

export class DiagnosisAgent implements DiagnosisAgentPort {
  analyze(input: { incident: SupervisorIncident; context: CognitiveContext }): DiagnosisReport {
    const category = categoryFor(input.incident, input.context)
    const evidenceIds = input.context.evidence.map(item => item.evidenceId)
    const evidenceCount = evidenceIds.length
    const confidenceScore = category === 'unclassified' ? Math.min(55, 25 + evidenceCount * 5) : Math.min(92, 60 + evidenceCount * 4)
    const explanation = category === 'unclassified'
      ? 'Available evidence does not support a known incident category with sufficient specificity.'
      : `Available evidence is most consistent with a ${category.replace('_', ' ')} incident affecting ${input.context.affectedResource}.`
    const hypothesis: DiagnosisHypothesis = { category, explanation, evidenceIds, confidenceScore }

    return {
      diagnosisId: `diag-${input.incident.incidentId}`,
      incidentId: input.incident.incidentId,
      hypotheses: [hypothesis],
      affectedResources: [input.context.affectedResource],
      evidenceIds,
      missingEvidence: evidenceCount === 0 ? ['At least one immutable incident evidence item is required.'] : [],
      confidenceScore,
      summary: explanation,
    }
  }
}
