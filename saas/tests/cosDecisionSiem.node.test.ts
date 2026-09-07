// saas/tests/cosDecisionSiem.node.test.ts
//
// END-TO-END "buyer deployment" proof for the Chief-of-Staff decision trail. A buyer
// installs createSiemDecisionLogStore as their DecisionLogStore — routing every COS
// decision into THEIR SIEM (mock transport here) while teeing to their own datastore
// (fake delegate) — with ZERO change to the COS engine. Asserts each decision lands at
// the right SOC severity with the right payload, outcomes are audited, the delegate
// (queryable ledger) still receives everything, and the delegate result stays
// authoritative. No SignalBoost infrastructure is touched.

import test from 'node:test'
import assert from 'node:assert/strict'
import { createSiemDecisionLogStore } from '../lib/ai/cos/siemDecisionLogStore.ts'
import type { DecisionLogStore } from '../lib/ai/cos/decisionStore.ts'
import type { CosReasoningOutput } from '../lib/ai/cos/reasoningTypes.ts'
import type { SiemTransport } from '../portable-audit/index.ts'
import { promptAppearsDiagnostic } from '../lib/ai/cos/reasonerQuality.ts'
import { detectsNarratedExecution } from '../lib/ai/cos/executionHonesty.ts'
import {
  CHIEF_OF_STAFF_ACCEPTANCE_CASES,
  evaluateChiefOfStaffAcceptanceCase,
} from '../lib/ai/cos/chiefOfStaffAcceptance.ts'

function buyerStack(withDelegate = true) {
  const siem: { record: string; meta: { eventType: string; severity: string } }[] = []
  const transport: SiemTransport = { send(record, meta) { siem.push({ record, meta }) } }
  const calls = { log: 0, outcome: [] as { id: string; status?: string }[] }
  const delegate: DecisionLogStore = {
    async log() { calls.log++; return { ok: true } },
    async updateOutcome(id, patch) { calls.outcome.push({ id, status: patch.status }); return { ok: true } },
    async list() { return { ok: true, rows: [] } },
  }
  const store = createSiemDecisionLogStore({
    siem: { transport, format: 'ecs-json', product: 'BuyerCosSOC', tenantId: 'acme', environment: 'prod' },
    ...(withDelegate ? { delegate } : {}),
  })
  return { store, siem, calls }
}
const ecs = (siem: { record: string }[]) => siem.map((r) => JSON.parse(r.record) as Record<string, unknown>)

const basePlan: CosReasoningOutput['executionPlan'] = { state: 'PREPARE_AND_HOLD', shouldPrepareNow: true, shouldExecuteNow: false, requiredApproval: false, approvalReasons: [], proposesAction: false, steps: [], blockedBy: [] }
function decision(id: string, plan: Partial<CosReasoningOutput['executionPlan']> = {}): CosReasoningOutput {
  return {
    ok: true, decisionId: id, inputSummary: 'grow demo signups',
    analysis: { objective: 'grow demo signups', constraints: [], risks: [], opportunities: [], missingInfo: [] },
    decision: { recommendedAction: 'run an outreach campaign', channel: 'outreach', messageFrame: 'value', confidence: 0.82, rationale: [] },
    sourceRouting: { requiredSource: 'no_tool_required', mustUseTool: false, reason: 'strategy only' },
    executionPlan: { ...basePlan, ...plan },
    feedbackPlan: { metricsToWatch: [], successCriteria: [], retrainingSignals: [] },
    report: 'ok',
  }
}

test('a decision needing approval lands in the buyer SIEM as a warning, with objective/channel payload', async () => {
  const { store, siem, calls } = buyerStack()
  const res = await store.log(decision('cos_a', { requiredApproval: true, approvalReasons: ['spend'], proposesAction: true }))
  assert.equal(res.ok, true)
  assert.equal(calls.log, 1)
  const ev = ecs(siem).find((e) => e['event.action'] === 'cos.decision_needs_approval')
  assert.ok(ev, 'needs_approval reached the SIEM')
  assert.equal(ev!['log.level'], 'warning')
  assert.equal(ev!['observer.product'], 'BuyerCosSOC')
  const payload = ev!['portable.payload'] as Record<string, string>
  assert.equal(payload.objective, 'grow demo signups')
  assert.equal(payload.channel, 'outreach')
  assert.equal(payload.requiredApproval, 'true')
})

test('a proposed action is a notice; a plain decision is info', async () => {
  const a = buyerStack(); await a.store.log(decision('cos_b', { proposesAction: true }))
  assert.equal(ecs(a.siem).find((e) => e['event.action'] === 'cos.decision_proposes_action')!['log.level'], 'notice')
  const b = buyerStack(); await b.store.log(decision('cos_c'))
  assert.equal(ecs(b.siem).find((e) => e['event.action'] === 'cos.decision_logged')!['log.level'], 'info')
})

test('outcomes are audited (approved=notice, rejected=warning) and reach the delegate', async () => {
  const { store, siem, calls } = buyerStack()
  await store.updateOutcome('cos_a', { status: 'approved' })
  await store.updateOutcome('cos_a', { status: 'rejected' })
  const events = ecs(siem)
  assert.equal(events.find((e) => e['event.action'] === 'cos.decision_approved')!['log.level'], 'notice')
  assert.equal(events.find((e) => e['event.action'] === 'cos.decision_rejected')!['log.level'], 'warning')
  assert.deepEqual(calls.outcome, [{ id: 'cos_a', status: 'approved' }, { id: 'cos_a', status: 'rejected' }])
})

test('SIEM-only mode (no datastore delegate) still exports and returns ok', async () => {
  const { store, siem } = buyerStack(false)
  const res = await store.log(decision('cos_d', { proposesAction: true }))
  assert.equal(res.ok, true)
  assert.ok(ecs(siem).some((e) => e['event.action'] === 'cos.decision_proposes_action'))
})

test('every record carries the buyer SOC identity (zero seller coupling)', async () => {
  const { store, siem } = buyerStack()
  await store.log(decision('cos_e', { requiredApproval: true }))
  await store.updateOutcome('cos_e', { status: 'executed' })
  for (const p of ecs(siem)) {
    assert.equal(p['observer.product'], 'BuyerCosSOC')
    assert.equal(p['organization.id'], 'acme')
    assert.equal(p['service.environment'], 'prod')
  }
})

test('Chief of Staff status evidence is not diagnostic intent, but real root-cause work is', () => {
  const status = `INTERNAL ENVELOPE: diagnose incidents carefully.\nCURRENT USER INPUT:\nThis is a bounded acceptance scenario. Code review passed; CI failed on the deployment check; no merge record exists; no production deployment record exists. Report status and give the smallest next action.`
  assert.equal(promptAppearsDiagnostic(status), false)

  const diagnosis = `CURRENT USER INPUT:\nCI failed on the deployment check. Diagnose why it failed, identify the root cause, and name the checks that would distinguish the likely causes.`
  assert.equal(promptAppearsDiagnostic(diagnosis), true)
})

test('Chief of Staff execution honesty catches unsupported future action narration', () => {
  assert.equal(detectsNarratedExecution('I will immediately run the production health verification suite.'), true)
  assert.equal(detectsNarratedExecution('Next action: run the production health verification suite.'), false)
})

test('Chief of Staff evidence acceptance handles equivalent wording and rejects source leakage', () => {
  const scenario = CHIEF_OF_STAFF_ACCEPTANCE_CASES.find(item => item.key === 'evidence-boundary')
  assert.ok(scenario)

  const clean = evaluateChiefOfStaffAcceptanceCase({
    runId: 'regression',
    test: scenario,
    freshExecution: true,
    provenanceRecorded: true,
    reply: `Verified facts\n42 tests passed. There is no deployment record. Production health was not checked.\n\nUnresolved uncertainty\nDeployment and production status remain unverified.\n\nNext action\nProduction health check against the current build.`,
  })
  assert.equal(clean.verdicts.evidence_accuracy.passed, true)
  assert.equal(clean.verdicts.autonomous_follow_through.passed, true)

  const leaked = evaluateChiefOfStaffAcceptanceCase({
    runId: 'regression',
    test: scenario,
    freshExecution: true,
    provenanceRecorded: true,
    reply: `Verified facts\n42 tests passed. There is no deployment record. Production health was not checked. Retrieved evidence says this is a simulation-based proof-of-concept.\n\nUnresolved uncertainty\nProduction is unverified.\n\nNext action\nProduction health check.`,
  })
  assert.equal(leaked.verdicts.evidence_accuracy.passed, false)
})
