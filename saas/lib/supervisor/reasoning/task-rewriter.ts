import type { SupervisorIncident } from '../incident-schema.ts'
import type { ReasoningIncidentShape, RewrittenTask } from './types.ts'

const SHAPES: Array<[ReasoningIncidentShape, RegExp]> = [
  ['availability', /\b(down|unavailable|unreachable|502|503|504|health\s?check|not responding|connection refused|timeout connecting)\b/i],
  ['deployment', /\b(deploy|deployment|rollout|release|build failed|revision)\b/i],
  ['saturation', /\b(memory|cpu|disk|quota|throttl|rate.?limit|queue depth|backlog|saturat|oom|capacity|pressure)\b/i],
  ['latency', /\b(latency|slow|p9[59]|response time|duration|timed? out)\b/i],
  ['errors', /\b(error rate|5xx|4xx|exception|failure rate|crash|panic|stack trace)\b/i],
  ['data_freshness', /\b(no data|stale|missing data|not draining|lag|behind|no recent)\b/i],
]

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function classifyReasoningIncident(incident: SupervisorIncident): ReasoningIncidentShape {
  const haystack = `${incident.errorMessage} ${incident.errorCode ?? ''} ${incident.affectedResource ?? ''}`
  for (const [shape, pattern] of SHAPES) if (pattern.test(haystack)) return shape
  return 'unclassified'
}

export class TaskRewriter {
  rewrite(incident: SupervisorIncident): RewrittenTask {
    const affectedResource = incident.affectedResource ?? incident.provider
    const shape = classifyReasoningIncident(incident)
    const canonicalMessage = normalizeText(incident.errorMessage)

    return {
      incidentId: incident.incidentId,
      provider: incident.provider,
      environment: incident.environment,
      canonicalGoal: `Diagnose and safely remediate the reported ${shape.replace('_', ' ')} incident affecting ${affectedResource}: ${canonicalMessage}`,
      affectedResource,
      shape,
      scopeBoundaries: [affectedResource, incident.provider, incident.environment],
      assumedState: { ...incident.metadata },
    }
  }
}
