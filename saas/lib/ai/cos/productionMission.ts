import type { CosReasoningOutput } from './reasoningTypes.ts'
import type { CosEvidence } from './knowledgeBridge.ts'
import { groundCosDecision } from './knowledgeBridge.ts'
import { runCosReasoning } from './reasoningCore.ts'
import { runCOSMissionGraph, type COSMissionGraphResult } from '@/lib/cos-core/orchestration/langgraph-mission'

export type COSProductionGroundingResult = {
  decisionId: string
  evidence: CosEvidence | null
}

export type COSProductionMissionDependencies = {
  reason?: (objective: string) => CosReasoningOutput | Promise<CosReasoningOutput>
  ground?: (decision: CosReasoningOutput) => COSProductionGroundingResult | Promise<COSProductionGroundingResult>
}

export type COSProductionGroundingMissionResult = COSMissionGraphResult<CosReasoningOutput, COSProductionGroundingResult>

function verifyGrounding(
  plan: CosReasoningOutput,
  result: COSProductionGroundingResult,
): { ok: boolean; reason?: string } {
  if (result.decisionId !== plan.decisionId) {
    return { ok: false, reason: 'grounding receipt decision id does not match the COS decision' }
  }

  // A blocked/invalid objective is itself a complete, deterministic COS decision.
  // The graph verifies the decision envelope and stops; it never turns a blocked
  // objective into an executable mission by retrying or changing authority.
  if (!plan.ok || plan.executionPlan.state === 'BLOCKED') {
    return { ok: true }
  }

  if (!plan.sourceRouting.mustUseTool) {
    return result.evidence === null
      ? { ok: true }
      : { ok: false, reason: 'reasoning required no live source but grounding returned unexpected evidence' }
  }

  const evidence = result.evidence
  if (!evidence) return { ok: false, reason: 'COS required live evidence but no grounding receipt was returned' }
  if (evidence.source !== plan.sourceRouting.requiredSource) {
    return { ok: false, reason: `grounding used ${evidence.source} instead of required source ${plan.sourceRouting.requiredSource}` }
  }

  if (evidence.fetched && evidence.summary.trim()) return { ok: true }

  // An explicitly unwired connector is a verified negative capability result.
  // The caller can tell the owner it cannot confirm the current fact instead of
  // silently answering from model memory.
  if (!evidence.connectorWired && evidence.summary.trim()) return { ok: true }

  return { ok: false, reason: evidence.error || `live evidence from ${evidence.source} was not fetched` }
}

export async function runCOSProductionGroundingMission(
  objective: string,
  dependencies: COSProductionMissionDependencies = {},
): Promise<COSProductionGroundingMissionResult> {
  const reason = dependencies.reason ?? ((value: string) => runCosReasoning({ objective: value }))
  const ground = dependencies.ground ?? groundCosDecision

  return runCOSMissionGraph(
    objective,
    {
      plan: (value) => reason(value),
      execute: async ({ plan }) => {
        // Host-owned reasoning decides whether a source is required and whether an
        // action is blocked/held/executable. LangGraph does not alter those fields.
        return ground(plan)
      },
      verify: ({ plan, result }) => verifyGrounding(plan, result),
      // A repair here is deliberately narrow: keep the exact deterministic COS
      // decision and retry only its read-only grounding step. It cannot change the
      // source, approval state, action classification, or execution authority.
      repair: ({ plan }) => plan,
    },
    { maxAttempts: 2, recursionLimit: 16 },
  )
}
