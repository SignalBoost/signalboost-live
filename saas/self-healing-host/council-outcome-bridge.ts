import type { DispatchRepairPlanResult } from '@/agent-gateway-host/supervisor-repair'
import {
  classifyDeterministicToolOutcome,
  recordCouncilObjectiveOutcome,
} from '@/lib/ai/cos/councilObjectiveOutcome'

export interface CouncilOutcomeBridgeSummary {
  attempted: number
  recorded: number
  matched: number
  success: number
  failure: number
  observed: number
  errors: string[]
}

function safeText(value: unknown, max = 500): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

/**
 * Feed governed Self-Healing execution/read-back results into the Council objective-outcome ledger.
 *
 * Only actual `execute` gateway outcomes are eligible. Approval staging/denial is governance state,
 * not evidence that the proposed repair worked. The bridge stores bounded facts only and never
 * manufactures per-specialist verdicts from a successful operation.
 */
export async function recordCouncilOutcomesFromRepairDispatch(input: {
  incidentId: string
  provider?: string | null
  environment?: string | null
  dispatch: DispatchRepairPlanResult
}): Promise<CouncilOutcomeBridgeSummary> {
  const summary: CouncilOutcomeBridgeSummary = {
    attempted: 0,
    recorded: 0,
    matched: 0,
    success: 0,
    failure: 0,
    observed: 0,
    errors: [],
  }

  const incidentId = safeText(input.incidentId, 500)
  if (!incidentId) return summary

  for (const step of input.dispatch.results) {
    const outcome = step.outcome
    if (outcome.verdict !== 'execute') continue
    summary.attempted += 1

    const classified = classifyDeterministicToolOutcome({
      ok: outcome.ok,
      result: outcome.result,
      error: outcome.error,
    })

    try {
      const recorded = await recordCouncilObjectiveOutcome({
        sourceClass: 'deterministic_tool',
        sourceRef: `agent-gateway:${safeText(outcome.requestId, 700)}`,
        correlation: { kind: 'incident_id', value: incidentId },
        outcomeStatus: classified.status,
        summary: classified.summary,
        facts: {
          ...classified.facts,
          provider: safeText(input.provider || 'unknown', 120),
          environment: safeText(input.environment || 'production', 120),
          gatewayRequestId: safeText(outcome.requestId, 700),
          action: safeText(step.action, 500),
          resolvedTarget: safeText(step.resolvedTarget || '', 300),
          consequenceClass: safeText(outcome.consequenceClass, 120),
        },
      })
      if (recorded.inserted) summary.recorded += 1
      if (recorded.matchedSessionId) summary.matched += 1
      summary[classified.status] += 1
    } catch (error) {
      summary.errors.push(error instanceof Error ? error.message.slice(0, 500) : 'Council objective-outcome write failed')
    }
  }

  return summary
}
