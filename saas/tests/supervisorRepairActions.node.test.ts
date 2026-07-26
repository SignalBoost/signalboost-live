// saas/tests/supervisorRepairActions.node.test.ts
//
// Proves the piece that makes self-healing visible: a diagnosed repair plan, run through
// the governed socket, lands as a REAL Infrastructure PR carrying the diagnosis's own words
// — and still cannot execute.

import test from 'node:test'
import assert from 'node:assert/strict'

import { runGoverned } from '../agent-gateway/index.ts'
import { defaultConsequenceClassifier } from '../agent-gateway/classifier.ts'
import type { GatewayHost, GovernancePolicy } from '../agent-gateway/index.ts'
import { createPrEngineApprovalPort } from '../agent-gateway-host/pr-engine-approvals.ts'
import {
  dispatchRepairPlan,
  repairStepToRequest,
  UNRECOGNIZED_TARGET,
} from '../agent-gateway-host/supervisor-repair.ts'
import type { RepairStep } from '../agent-gateway-host/supervisor-repair.ts'
import {
  INSPECT_DATABASE_TARGET,
  INSPECT_VAULT_TARGET,
  INSPECT_VERCEL_ENV_TARGET,
  PROPOSED_REPAIR_TARGET,
  REPAIR_REVIEW_TEMPLATE,
  SUPERVISOR_REPAIR_ACTIONS,
  resolveSupervisorRepairAction,
  resolveSupervisorRepairParams,
  summarizeRepairDispatch,
} from '../agent-gateway-host/supervisor-actions.ts'

const INCIDENT = { incident_id: 'INC-SB-2026-ABCD1234', project: 'signalboost-live', provider: 'Vercel' }

function planStep(over: Partial<RepairStep> = {}): RepairStep {
  return {
    step: 1,
    action: 'Restore the missing SUPABASE_SERVICE_ROLE_KEY value in production.',
    executor: 'api_executor',
    target: 'vercel environment variables',
    expected_result: 'The build resolves the Supabase client and completes.',
    requires_approval: false,
    ...over,
  }
}

/** A host whose approval port is the real pr-engine adapter over a captured stage function. */
function hostWithCapturedStaging() {
  const staged: any[] = []
  const approvals = createPrEngineApprovalPort({
    stageInfrastructurePr: async (input) => {
      staged.push(input)
      return { ok: true, pr: { id: `pr_${staged.length}` } }
    },
    actions: SUPERVISOR_REPAIR_ACTIONS,
  })
  const host: GatewayHost = {
    execution: { perform: async () => ({ ok: false, error: 'no executor should ever be reached' }) },
    approvals,
  }
  return { host, staged }
}

const POLICY: GovernancePolicy = { classifier: defaultConsequenceClassifier, allowlist: [] }

test('the resolver never turns model prose into an executable target', () => {
  const step = planStep({ action: 'rm -rf everything and wire $50,000', target: 'anything at all' })
  const resolved = resolveSupervisorRepairAction(step, INCIDENT)
  assert.ok(
    [PROPOSED_REPAIR_TARGET, INSPECT_VERCEL_ENV_TARGET, INSPECT_DATABASE_TARGET, INSPECT_VAULT_TARGET].includes(resolved!),
    'resolver returned something outside the closed set',
  )
  const request = repairStepToRequest(INCIDENT, step, resolved, 'autonomous-supervisor')
  assert.notEqual(request.action.target, step.action)
  assert.equal(request.action.params?.describedAction, step.action)
})

test('the diagnosis picks the evidence action that matches what it says broke', () => {
  const db = planStep({ action: 'inspect the migration that failed', target: 'database schema', expected_result: 'the schema is consistent' })
  assert.equal(resolveSupervisorRepairAction(db, INCIDENT), INSPECT_DATABASE_TARGET)
  const vault = planStep({ action: 'rotate the credential', target: 'vault', expected_result: 'the rotation completes' })
  assert.equal(resolveSupervisorRepairAction(vault, INCIDENT), INSPECT_VAULT_TARGET)
  const env = planStep({ action: 'the SUPABASE_SERVICE_ROLE_KEY environment variable is missing', target: 'env' })
  assert.equal(resolveSupervisorRepairAction(env, INCIDENT), INSPECT_VERCEL_ENV_TARGET)
})

test('the diagnosis names the VARIABLE and ENVIRONMENT — and never a value', () => {
  const step = planStep({
    action: 'Restore the missing SUPABASE_SERVICE_ROLE_KEY in production; set it to sk-do-not-copy-this',
    target: 'vercel environment variables',
  })
  const params = resolveSupervisorRepairParams(step, INCIDENT)
  assert.equal(params.identifiedVariable, 'SUPABASE_SERVICE_ROLE_KEY')
  assert.equal(params.identifiedEnvironment, 'production')
  assert.deepEqual(Object.keys(params).sort(), ['identifiedEnvironment', 'identifiedVariable'])
  assert.ok(!JSON.stringify(params).includes('sk-do-not-copy-this'))
})

test('NO MUTATING PROVIDER ACTION IS MAPPED — a model can never author a secret into a PR', () => {
  const mutating = ['vercel.add_env_var', 'vercel.edit_env', 'vercel.delete_env', 'supabase.run_migration', 'vercel.rotate_token']
  for (const action of SUPERVISOR_REPAIR_ACTIONS) {
    assert.ok(!mutating.includes(action.templateId), `${action.target} maps to a mutating template`)
    assert.ok(!(action.allowedParams ?? []).includes('value'), `${action.target} would carry a value`)
    assert.ok(!(action.allowedParams ?? []).some((p) => /secret|token|password|key$/i.test(p)), `${action.target} would carry a credential`)
  }
})

test('a proposed repair halts and is staged as a read-only cockpit PR', async () => {
  const { host, staged } = hostWithCapturedStaging()
  const result = await dispatchRepairPlan({
    incident: INCIDENT,
    repairPlan: [planStep()],
    policy: POLICY,
    host,
    resolveAction: resolveSupervisorRepairAction,
    resolveParams: resolveSupervisorRepairParams,
  })

  assert.equal(result.completed, false)
  assert.equal(result.results[0].outcome.verdict, 'halt_for_approval')
  assert.equal(result.results[0].outcome.ok, false)
  assert.equal(result.results[0].outcome.approvalId, 'pr_1')
  assert.equal(staged.length, 1)
  assert.equal(staged[0].steps.length, 1)
  assert.equal(staged[0].steps[0].templateId, 'vercel.view_env')
  assert.equal(staged[0].steps[0].provider, 'vercel')
  assert.equal(staged[0].steps[0].payload.identifiedVariable, 'SUPABASE_SERVICE_ROLE_KEY')
  assert.match(staged[0].summary, /Restore the missing SUPABASE_SERVICE_ROLE_KEY value in production/)
  assert.equal(staged[0].steps[0].payload.incidentId, INCIDENT.incident_id)
  assert.equal(staged[0].steps[0].payload.describedAction, undefined, 'prose must stay out of the fingerprinted payload')
})

test('a step the diagnosis marked as needing approval still reaches the cockpit', async () => {
  const { host, staged } = hostWithCapturedStaging()
  const result = await dispatchRepairPlan({
    incident: INCIDENT,
    repairPlan: [planStep({ requires_approval: true })],
    policy: POLICY,
    host,
    resolveAction: resolveSupervisorRepairAction,
  })

  assert.equal(result.results[0].resolvedTarget, null)
  assert.equal(result.results[0].outcome.approvalId, 'pr_1')
  assert.equal(staged[0].steps[0].templateId, REPAIR_REVIEW_TEMPLATE)
})

test('a human-assigned step is never machine-dispatched but is still staged', async () => {
  const { host, staged } = hostWithCapturedStaging()
  await dispatchRepairPlan({
    incident: INCIDENT,
    repairPlan: [planStep({ executor: 'human' })],
    policy: POLICY,
    host,
    resolveAction: resolveSupervisorRepairAction,
  })
  assert.equal(staged.length, 1)
})

test('every mapped target stages a template that is read-only AND has a real handler', () => {
  const targets = SUPERVISOR_REPAIR_ACTIONS.map((a) => a.target).sort()
  assert.deepEqual(targets, [
    PROPOSED_REPAIR_TARGET, UNRECOGNIZED_TARGET, INSPECT_VERCEL_ENV_TARGET, INSPECT_DATABASE_TARGET, INSPECT_VAULT_TARGET,
  ].sort())
  const executable = new Set(['vercel.view_env', 'supabase.list_tables', 'vault.view_keys'])
  for (const action of SUPERVISOR_REPAIR_ACTIONS) {
    assert.equal(action.actionKind, 'supervisor_repair')
    assert.ok(executable.has(action.templateId), `${action.target} maps to ${action.templateId}`)
  }
})

test('the proposed-repair target can never execute: it is not classified reversible', async () => {
  const request = repairStepToRequest(INCIDENT, planStep(), PROPOSED_REPAIR_TARGET, 'autonomous-supervisor')
  const outcome = await runGoverned(
    request,
    {
      classifier: defaultConsequenceClassifier,
      allowlist: [{ actionKind: 'supervisor_repair', target: PROPOSED_REPAIR_TARGET, rollback: 'none' }],
    },
    { execution: { perform: async () => ({ ok: true, result: 'SHOULD NOT RUN' }) } },
  )
  assert.equal(outcome.consequenceClass, 'unknown')
  assert.equal(outcome.verdict, 'halt_for_approval')
})

test('later steps are held until the first one is approved', async () => {
  const { host, staged } = hostWithCapturedStaging()
  const plan = [planStep({ step: 2 }), planStep({ step: 1 }), planStep({ step: 3 })]
  const result = await dispatchRepairPlan({
    incident: INCIDENT,
    repairPlan: plan,
    policy: POLICY,
    host,
    resolveAction: resolveSupervisorRepairAction,
  })

  assert.equal(result.results.length, 1)
  assert.equal(result.results[0].step, 1)
  assert.equal(staged.length, 1)

  const summary = summarizeRepairDispatch(result, plan.length)
  assert.equal(summary.mode, 'staged')
  assert.equal(summary.planned, 3)
  assert.equal(summary.attempted, 1)
  assert.deepEqual(summary.prIds, ['pr_1'])
  assert.match(summary.message, /Step 1 of 3/)
})

test('a cockpit that cannot stage is reported as unavailable, never as staged', async () => {
  const approvals = createPrEngineApprovalPort({
    stageInfrastructurePr: async () => ({ ok: false, error: 'Supabase service role is not configured' }),
    actions: SUPERVISOR_REPAIR_ACTIONS,
  })
  const host: GatewayHost = {
    execution: { perform: async () => ({ ok: false, error: 'unreachable' }) },
    approvals,
  }
  const result = await dispatchRepairPlan({
    incident: INCIDENT,
    repairPlan: [planStep()],
    policy: POLICY,
    host,
    resolveAction: resolveSupervisorRepairAction,
  })
  const summary = summarizeRepairDispatch(result, 1)
  assert.equal(summary.mode, 'unavailable')
  assert.deepEqual(summary.prIds, [])
})

test('an empty repair plan is reported honestly, not as a repair', () => {
  const summary = summarizeRepairDispatch({ completed: true, results: [] }, 0)
  assert.equal(summary.mode, 'not_required')
  assert.equal(summary.prIds.length, 0)
})


test('DEDUPE: the same root cause twice produces an IDENTICAL staged payload', async () => {
  const runOnce = async (prose: string) => {
    const { staged } = hostWithCapturedStaging()
    const host = hostWithCapturedStaging()
    const result = await dispatchRepairPlan({
      incident: INCIDENT,
      repairPlan: [planStep({ action: prose, expected_result: `${prose} — attempt` })],
      policy: POLICY,
      host: host.host,
      resolveAction: resolveSupervisorRepairAction,
      resolveParams: resolveSupervisorRepairParams,
    })
    assert.equal(result.completed, false)
    return host.staged[0]
  }

  const first = await runOnce('Restore the missing SUPABASE_SERVICE_ROLE_KEY value in production.')
  const second = await runOnce('Set SUPABASE_SERVICE_ROLE_KEY in the production environment.')

  assert.deepEqual(
    first.steps[0].payload,
    second.steps[0].payload,
    'payloads differ, so pr-engine would stage two PRs for one root cause',
  )
  assert.equal(first.steps[0].templateId, second.steps[0].templateId)
  assert.notEqual(first.summary, second.summary)
})
