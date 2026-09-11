import test from 'node:test'
import assert from 'node:assert/strict'
import type { CosReasoningOutput, CosSourceType } from '../lib/ai/cos/reasoningTypes.ts'
import { runCOSProductionGroundingMission } from '../lib/ai/cos/productionMission.ts'

function decision(options: {
  source?: CosSourceType
  mustUseTool?: boolean
  ok?: boolean
  state?: CosReasoningOutput['executionPlan']['state']
} = {}): CosReasoningOutput {
  const source = options.source ?? 'no_tool_required'
  const mustUseTool = options.mustUseTool ?? false
  const ok = options.ok ?? true
  const state = options.state ?? (mustUseTool ? 'RETRIEVE_AND_ANSWER' : 'ANALYZE_ONLY')
  return {
    ok,
    decisionId: 'cos_test_1',
    inputSummary: 'test objective',
    analysis: {
      objective: 'test objective',
      constraints: [],
      risks: [],
      opportunities: [],
      missingInfo: [],
    },
    decision: {
      recommendedAction: 'test',
      channel: 'analysis_only',
      messageFrame: 'test',
      confidence: 0.8,
      rationale: [],
    },
    sourceRouting: {
      requiredSource: source,
      mustUseTool,
      reason: 'test routing',
    },
    executionPlan: {
      state,
      shouldPrepareNow: ok,
      shouldExecuteNow: state === 'EXECUTE',
      requiredApproval: state === 'PREPARE_AND_HOLD',
      approvalReasons: [],
      proposesAction: false,
      steps: [],
      blockedBy: [],
    },
    feedbackPlan: {
      metricsToWatch: [],
      successCriteria: [],
      retrainingSignals: [],
    },
    report: 'test report',
  }
}

test('production COS mission verifies reasoning-only work without inventing evidence', async () => {
  const result = await runCOSProductionGroundingMission('test objective', {
    reason: () => decision(),
    ground: (plan) => ({ decisionId: plan.decisionId, evidence: null }),
  })

  assert.equal(result.status, 'verified')
  assert.equal(result.attempts, 1)
  assert.equal(result.plan.sourceRouting.mustUseTool, false)
  assert.equal(result.result.evidence, null)
})

test('production COS mission retries only read-only grounding after a transient fetch failure', async () => {
  let calls = 0
  const result = await runCOSProductionGroundingMission('check production deployment', {
    reason: () => decision({ source: 'vercel_deployment', mustUseTool: true }),
    ground: (plan) => {
      calls += 1
      if (calls === 1) {
        return {
          decisionId: plan.decisionId,
          evidence: {
            source: 'vercel_deployment',
            connectorWired: true,
            fetched: false,
            summary: '',
            error: 'temporary Vercel read failure',
          },
        }
      }
      return {
        decisionId: plan.decisionId,
        evidence: {
          source: 'vercel_deployment',
          connectorWired: true,
          fetched: true,
          summary: 'Production deployment is READY.',
        },
      }
    },
  })

  assert.equal(result.status, 'verified')
  assert.equal(result.attempts, 2)
  assert.equal(calls, 2)
  assert.deepEqual(result.trace, ['plan', 'execute:1', 'verify:1:fail', 'repair:1', 'execute:2', 'verify:2:pass'])
})

test('production COS mission treats an explicitly unwired source as verified negative capability evidence', async () => {
  const result = await runCOSProductionGroundingMission('read analytics', {
    reason: () => decision({ source: 'analytics', mustUseTool: true }),
    ground: (plan) => ({
      decisionId: plan.decisionId,
      evidence: {
        source: 'analytics',
        connectorWired: false,
        fetched: false,
        summary: 'No analytics provider is integrated yet.',
      },
    }),
  })

  assert.equal(result.status, 'verified')
  assert.equal(result.attempts, 1)
})

test('production COS mission fails closed after the bounded grounding retry budget', async () => {
  let calls = 0
  const result = await runCOSProductionGroundingMission('check production deployment', {
    reason: () => decision({ source: 'vercel_deployment', mustUseTool: true }),
    ground: (plan) => {
      calls += 1
      return {
        decisionId: plan.decisionId,
        evidence: {
          source: 'vercel_deployment',
          connectorWired: true,
          fetched: false,
          summary: '',
          error: 'source unavailable',
        },
      }
    },
  })

  assert.equal(result.status, 'unverified')
  assert.equal(result.attempts, 2)
  assert.equal(calls, 2)
  assert.equal(result.reason, 'source unavailable')
})

test('production COS mission preserves a blocked COS decision instead of retrying it into authority', async () => {
  let groundCalls = 0
  const blocked = decision({ ok: false, state: 'BLOCKED' })
  const result = await runCOSProductionGroundingMission('', {
    reason: () => blocked,
    ground: (plan) => {
      groundCalls += 1
      return { decisionId: plan.decisionId, evidence: null }
    },
  })

  assert.equal(result.status, 'verified')
  assert.equal(result.attempts, 1)
  assert.equal(result.plan.executionPlan.state, 'BLOCKED')
  assert.equal(groundCalls, 1)
})
