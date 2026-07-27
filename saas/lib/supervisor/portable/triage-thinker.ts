// saas/lib/supervisor/portable/triage-thinker.ts
//
// THE FIRST VENDOR-NEUTRAL THINKER.
//
// The only Thinker in the repository was Vercel-specific — it reads Vercel incident
// types out of metadata and proposes Vercel steps. A buyer feeding alerts in from
// Datadog or Alertmanager had nothing to diagnose with, so the orchestrator could
// never run for them at all.
//
// This one is deliberately modest, and the modesty is the design:
//
//   IT ONLY EVER PROPOSES READING. Every step it emits is `read` or `verify`. It
//   cannot express a mutation, so there is no configuration, no prompt and no
//   provider response that can turn it into something that changes a buyer's system.
//   The policy engine still gates everything after it — but a component that cannot
//   propose a destructive action is a much smaller thing to trust than one that can
//   and is prevented.
//
//   IT IS DETERMINISTIC. The same incident produces the same plan, every time, with
//   no model call, no network and no cost. An operator reviewing a plan can reproduce
//   it exactly. That matters more than cleverness for the first thing a buyer runs.
//
// What it is NOT: it does not know how to fix anything. It turns an alert into an
// ordered set of questions a responder would ask first, which is the honest floor —
// and it is far more than the nothing that was there before.

import type { Thinker } from '../execution-contracts.ts'
import type { SupervisorIncident } from '../incident-schema.ts'
import type { RepairPlan, RepairStep } from '../repair-plan-schema.ts'

export const TRIAGE_PLAN_SCHEMA_VERSION = 'portable-triage-plan-v1'

export interface TriageThinkerOptions {
  now?: () => Date
  // Confidence is reported, never acted on. It exists so an operator reviewing the
  // plan can see the difference between "we recognised this shape" and "we are
  // asking generic questions".
  baseConfidence?: number
}

const safeId = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 60) || 'unknown'

const readStep = (stepId: string, description: string, parameters: Record<string, string> = {}, expectedResult?: string): RepairStep => ({
  stepId,
  action: 'read',
  description,
  protectedAction: false,
  parameters,
  ...(expectedResult ? { expectedResult } : {}),
})

// Recognised shapes. Each is a family of failure an on-call engineer triages the same
// way regardless of which vendor reported it, which is exactly why this can be
// vendor-neutral: the questions belong to the failure, not to the monitoring tool.
type IncidentShape = 'availability' | 'saturation' | 'latency' | 'errors' | 'data_freshness' | 'deployment' | 'unclassified'

const SHAPES: Array<[IncidentShape, RegExp]> = [
  ['availability', /\b(down|unavailable|unreachable|502|503|504|health\s?check|not responding|connection refused|timeout connecting)\b/i],
  ['deployment', /\b(deploy|deployment|rollout|release|build failed|revision)\b/i],
  ['saturation', /\b(memory|cpu|disk|quota|throttl|rate.?limit|queue depth|backlog|saturat|oom|capacity|pressure)\b/i],
  ['latency', /\b(latency|slow|p9[59]|response time|duration|timed? out)\b/i],
  ['errors', /\b(error rate|5xx|4xx|exception|failure rate|crash|panic|stack trace)\b/i],
  ['data_freshness', /\b(no data|stale|missing data|not draining|lag|behind|no recent)\b/i],
]

export function classifyIncidentShape(incident: SupervisorIncident): IncidentShape {
  const haystack = `${incident.errorMessage} ${incident.errorCode ?? ''} ${incident.affectedResource ?? ''}`
  for (const [shape, pattern] of SHAPES) if (pattern.test(haystack)) return shape
  return 'unclassified'
}

// The questions per shape. Ordered the way a responder would actually ask them:
// confirm it is real, then establish scope, then look for a cause.
const QUESTIONS: Record<IncidentShape, Array<[string, string]>> = {
  availability: [
    ['confirm-unavailable', 'Confirm the reported endpoint or service is still unavailable rather than recovered'],
    ['check-dependencies', 'Read the health of the immediate dependencies of the affected resource'],
    ['check-recent-change', 'Read the most recent deployment or configuration change affecting the resource'],
  ],
  deployment: [
    ['read-deployment-status', 'Read the current status of the deployment or release named in the alert'],
    ['read-build-log', 'Read the failing build or rollout log for the first reported error'],
    ['compare-previous', 'Read the previously healthy revision for comparison'],
  ],
  saturation: [
    ['confirm-current-usage', 'Read the current value of the saturated resource to confirm the alert still holds'],
    ['read-trend', 'Read the trend over the preceding period to distinguish a spike from sustained growth'],
    ['identify-top-consumer', 'Read which workload or tenant is consuming the most of the constrained resource'],
  ],
  latency: [
    ['confirm-latency', 'Read the current latency percentile to confirm the alert still holds'],
    ['locate-slow-path', 'Read per-endpoint or per-operation timings to locate where the time is spent'],
    ['check-dependency-latency', 'Read the latency of downstream dependencies'],
  ],
  errors: [
    ['confirm-error-rate', 'Read the current error rate to confirm the alert still holds'],
    ['sample-errors', 'Read a sample of the failing responses to identify the dominant error'],
    ['check-recent-change', 'Read the most recent deployment or configuration change affecting the resource'],
  ],
  data_freshness: [
    ['confirm-staleness', 'Read the timestamp of the most recent record to confirm data is still stale'],
    ['check-producer', 'Read the health of the producer or job expected to be writing the data'],
    ['check-queue-depth', 'Read the depth and age of any queue feeding the affected data'],
  ],
  unclassified: [
    ['read-affected-resource', 'Read the current state of the resource named in the alert'],
    ['read-recent-events', 'Read recent events for the affected resource around the time of the alert'],
  ],
}

export function createTriageThinker(options: TriageThinkerOptions = {}): Thinker {
  const now = options.now ?? (() => new Date())
  const baseConfidence = Math.max(0, Math.min(100, Math.round(options.baseConfidence ?? 60)))

  return {
    proposeRepairPlan(incident: SupervisorIncident): RepairPlan {
      const shape = classifyIncidentShape(incident)
      const target = incident.affectedResource ?? incident.provider
      const questions = QUESTIONS[shape]

      const steps = questions.map(([id, description]) =>
        readStep(`triage-${safeId(id)}`, `${description} (${target})`, { target, shape, incidentId: incident.incidentId }))

      // The plan schema requires non-empty verification steps, and rightly so. For a
      // read-only triage the verification is that the observations were actually
      // gathered — there is no repair whose effect could be checked.
      const verificationSteps: RepairStep[] = [
        readStep('triage-verify-observations', `Confirm each triage observation for ${target} returned a result`, { target, shape }, 'observations recorded'),
      ]

      return {
        planId: `triage-${safeId(incident.incidentId)}`,
        incidentId: incident.incidentId,
        diagnosis: shape === 'unclassified'
          // Stated plainly rather than dressed up. An operator must be able to see
          // that this plan is generic, not that the system understood the problem.
          ? `This alert did not match a known failure shape, so the plan gathers general state for ${target} rather than targeted diagnosis.`
          : `The alert describes a ${shape.replace('_', ' ')} problem affecting ${target}. The plan gathers the observations needed to confirm it and locate the cause.`,
        // A generic plan reports lower confidence, so "we recognised nothing" never
        // looks the same as "we recognised this".
        confidenceScore: shape === 'unclassified' ? Math.min(baseConfidence, 30) : baseConfidence,
        requiresBrowser: false,
        riskLevel: 'low',
        targetProvider: incident.provider,
        targetEnvironment: incident.environment,
        steps,
        verificationSteps,
        generatedAt: now().toISOString(),
        schemaVersion: TRIAGE_PLAN_SCHEMA_VERSION,
      }
    },
  }
}
