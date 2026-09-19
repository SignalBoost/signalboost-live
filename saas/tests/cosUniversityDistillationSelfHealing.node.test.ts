import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  buildUniversityMassDistillationIncident,
  deriveCurriculumPackagingProgress,
  evaluateUniversityMassDistillationHealth,
  UNIVERSITY_DISTILLATION_RECOVERY_TARGET,
} from '../self-healing-host/university-distillation-monitoring.ts'
import {
  createNativeRepairActionResolver,
  diagnoseRegisteredNativeRecovery,
} from '../self-healing-host/native-repair-action-resolver.ts'

const now = new Date('2026-09-15T12:00:00.000Z')
const campaign = {
  id: 'campaign-1', status: 'active', authorized_at: '2026-09-15T10:00:00.000Z',
  expires_at: '2026-09-15T18:00:00.000Z', max_total_cost_usd: 1.825, committed_cost_usd: 0.2,
}
const receipt = {
  observed_at: '2026-09-15T11:58:00.000Z', commit_sha: 'abc123', evidence: { invocationSucceeded: true },
}
const runningJob = {
  campaign_id: 'campaign-1', operation: 'teacher', dispatched_at: '2026-09-15T11:55:00.000Z',
  timeout_seconds: 1800, provider_stage: 'RUNNING',
}

function health(overrides: Record<string, unknown> = {}) {
  return evaluateUniversityMassDistillationHealth({
    now,
    expectedIntervalSeconds: 300,
    campaigns: [campaign],
    receipt,
    workflowRuns: [{
      id: 'run-1', campaign_id: 'campaign-1', stage: 'teacher_dispatched',
      updated_at: '2026-09-15T11:55:00.000Z', failure_reason: null,
    }],
    providerJobs: [runningJob],
    ...overrides,
  } as any)
}

test('active distillation with a fresh durable receipt and bounded provider job is healthy', () => {
  const snapshot = health()
  assert.equal(snapshot.state, 'healthy')
  assert.deepEqual(snapshot.reasons, [])
  assert.equal(snapshot.automaticRecoveryAuthorized, false)
  assert.equal(snapshot.remainingAuthorizedCostUsd, 1.625)
})

test('continuity states distinguish supply wait, repairable campaign gap, rolling budget pause, and missing authority', () => {
  const base = {
    now,
    expectedIntervalSeconds: 300,
    campaigns: [],
    receipt,
    workflowRuns: [],
    providerJobs: [],
  }
  const waiting = evaluateUniversityMassDistillationHealth({
    ...base,
    continuity: {
      preparedBatches: 0,
      rollingPolicyEnabled: true,
      rollingMaximumAuthorizedCostUsd: 25,
      rollingAuthorizedCostUsd: 10.95,
      nextBudgetReleaseAt: '2026-09-16T16:31:41.969Z',
    },
  })
  assert.equal(waiting.state, 'waiting_for_curriculum')
  assert.deepEqual(waiting.reasons, ['curriculum_supply_waiting'])
  assert.equal(waiting.automaticRecoveryAuthorized, false)
  assert.equal(waiting.rollingRemainingAuthorizedCostUsd, 14.05)

  const repairable = evaluateUniversityMassDistillationHealth({
    ...base,
    continuity: { ...waiting, preparedBatches: 1, rollingPolicyEnabled: true },
  } as any)
  assert.equal(repairable.state, 'repair_required')
  assert.deepEqual(repairable.reasons, ['prepared_campaign_not_authorized'])
  assert.equal(repairable.automaticRecoveryAuthorized, true)
  const incident = buildUniversityMassDistillationIncident(repairable)
  assert.equal(incident.metadata.retryScope, 'one_prepared_batch_within_owner_rolling_24h_maximum_authority')
  assert.ok(diagnoseRegisteredNativeRecovery(incident))

  const paused = evaluateUniversityMassDistillationHealth({
    ...base,
    continuity: {
      preparedBatches: 2,
      rollingPolicyEnabled: true,
      rollingMaximumAuthorizedCostUsd: 25,
      rollingAuthorizedCostUsd: 23.725,
      nextBudgetReleaseAt: '2026-09-16T16:31:41.969Z',
    },
  })
  assert.equal(paused.state, 'budget_paused')
  assert.deepEqual(paused.reasons, ['rolling_budget_exhausted'])
  assert.equal(paused.automaticRecoveryAuthorized, false)

  const unauthorized = evaluateUniversityMassDistillationHealth({
    ...base,
    continuity: {
      preparedBatches: 2,
      rollingPolicyEnabled: false,
      rollingMaximumAuthorizedCostUsd: 0,
      rollingAuthorizedCostUsd: 0,
      nextBudgetReleaseAt: null,
    },
  })
  assert.equal(unauthorized.state, 'authorization_required')
  assert.deepEqual(unauthorized.reasons, ['rolling_authorization_disabled'])
})

test('same-subject replenishment that satisfies the shortfall but yields zero packages is a repairable progress defect', () => {
  const progress = deriveCurriculumPackagingProgress([{
    observed_at: '2026-09-15T11:56:00.000Z',
    commit_sha: 'abc123',
    evidence: {
      slowMaintenanceDue: true,
      preparedBeforeReplenishment: 0,
      preparedAfterReplenishment: 0,
      curriculum: {
        batchesPrepared: 0,
        supply: { subjects: [{ subject: 'Statistics & Data Science', shortfallToBatch: 16 }] },
      },
      curriculumReplenishment: {
        failureDerivedBySubject: [{ subject: 'Statistics & Data Science', inserted: 2 }],
        syntheticBySubject: [{ subject: 'Statistics & Data Science', inserted: 16 }],
      },
    },
  }])
  assert.equal(progress.stalled, true)
  assert.equal(progress.subject, 'Statistics & Data Science')
  assert.equal(progress.shortfallToBatch, 16)
  assert.equal(progress.insertedForSubject, 18)

  const snapshot = evaluateUniversityMassDistillationHealth({
    now,
    expectedIntervalSeconds: 300,
    campaigns: [],
    receipt,
    workflowRuns: [],
    providerJobs: [],
    curriculumProgress: progress,
    continuity: {
      preparedBatches: 0,
      rollingPolicyEnabled: true,
      rollingMaximumAuthorizedCostUsd: null,
      rollingAuthorizedCostUsd: 10.95,
      nextBudgetReleaseAt: null,
    },
  })
  assert.equal(snapshot.state, 'repair_required')
  assert.deepEqual(snapshot.reasons, ['curriculum_packaging_stalled'])
  assert.equal(snapshot.automaticRecoveryAuthorized, true)
  assert.equal(snapshot.curriculumProgressSubject, 'Statistics & Data Science')
  const incident = buildUniversityMassDistillationIncident(snapshot)
  assert.equal(incident.severity, 'critical')
  assert.equal(incident.metadata.curriculumPackagingStalled, true)
  assert.equal(incident.metadata.curriculumProgressInsertedForSubject, 18)
  assert.equal(incident.metadata.recoveryPreauthorized, true)
})

test('freshly satisfied packaging progress clears the defect instead of replaying an old contradiction', () => {
  const progress = deriveCurriculumPackagingProgress([{
    observed_at: '2026-09-15T11:56:00.000Z',
    commit_sha: 'abc123',
    evidence: {
      slowMaintenanceDue: true,
      preparedBeforeReplenishment: 0,
      preparedAfterReplenishment: 2,
      curriculum: {
        batchesPrepared: 2,
        supply: { subjects: [{ subject: 'Statistics & Data Science', shortfallToBatch: 16 }] },
      },
      curriculumReplenishment: {
        syntheticBySubject: [{ subject: 'Statistics & Data Science', inserted: 16 }],
      },
    },
  }, {
    observed_at: '2026-09-15T11:51:00.000Z',
    commit_sha: 'old',
    evidence: {
      slowMaintenanceDue: true,
      preparedBeforeReplenishment: 0,
      preparedAfterReplenishment: 0,
      curriculum: { batchesPrepared: 0, supply: { subjects: [{ subject: 'Statistics & Data Science', shortfallToBatch: 16 }] } },
      curriculumReplenishment: { syntheticBySubject: [{ subject: 'Statistics & Data Science', inserted: 16 }] },
    },
  }])
  assert.equal(progress.stalled, false)
  assert.equal(progress.preparedAfter, 2)
})

test('a broken control-loop heartbeat is repairable even while curriculum supply is empty', () => {
  const snapshot = evaluateUniversityMassDistillationHealth({
    now,
    expectedIntervalSeconds: 300,
    campaigns: [],
    receipt: { ...receipt, observed_at: '2026-09-15T11:30:00.000Z' },
    workflowRuns: [],
    providerJobs: [],
    continuity: {
      preparedBatches: 0,
      rollingPolicyEnabled: true,
      rollingMaximumAuthorizedCostUsd: 25,
      rollingAuthorizedCostUsd: 10.95,
      nextBudgetReleaseAt: null,
    },
  })
  assert.equal(snapshot.state, 'repair_required')
  assert.deepEqual(snapshot.reasons, ['heartbeat_stale'])
  assert.equal(snapshot.automaticRecoveryAuthorized, true)
})

test('unsettled provider work remains visible after its campaign leaves the active window', () => {
  const snapshot = evaluateUniversityMassDistillationHealth({
    now,
    expectedIntervalSeconds: 300,
    campaigns: [],
    receipt,
    workflowRuns: [],
    providerJobs: [runningJob],
    continuity: {
      preparedBatches: 1,
      rollingPolicyEnabled: true,
      rollingMaximumAuthorizedCostUsd: 25,
      rollingAuthorizedCostUsd: 10.95,
      nextBudgetReleaseAt: null,
    },
  })
  assert.equal(snapshot.state, 'repair_required')
  assert.deepEqual(snapshot.reasons, ['provider_job_unsettled'])
  assert.equal(snapshot.unsettledProviderJobs, 1)
  assert.equal(snapshot.automaticRecoveryAuthorized, true)
})

test('stale heartbeat produces an exact pre-authorized Supervisor recovery incident', () => {
  const snapshot = health({
    receipt: { ...receipt, observed_at: '2026-09-15T11:30:00.000Z' },
  })
  assert.equal(snapshot.state, 'repair_required')
  assert.deepEqual(snapshot.reasons, ['heartbeat_stale'])
  assert.equal(snapshot.automaticRecoveryAuthorized, true)

  const incident = buildUniversityMassDistillationIncident(snapshot)
  assert.equal(incident.metadata.registeredRecoveryAction, UNIVERSITY_DISTILLATION_RECOVERY_TARGET)
  assert.equal(incident.metadata.recoveryPreauthorized, true)
  const diagnostic = diagnoseRegisteredNativeRecovery(incident)
  assert.ok(diagnostic)
  assert.equal(diagnostic.requires_human_approval, false)
  assert.equal(diagnostic.repair_plan.length, 1)
  assert.equal(diagnostic.repair_plan[0].requires_approval, false)
  const resolver = createNativeRepairActionResolver(incident)
  assert.equal(resolver(diagnostic.repair_plan[0], {
    incident_id: incident.incidentId,
    project: String(incident.affectedResource),
  }), UNIVERSITY_DISTILLATION_RECOVERY_TARGET)
})

test('expired or overspent authority can be diagnosed but cannot be auto-repaired', () => {
  for (const unsafeCampaign of [
    { ...campaign, expires_at: '2026-09-15T11:59:00.000Z' },
    { ...campaign, committed_cost_usd: 1.826 },
  ]) {
    const snapshot = health({
      campaigns: [unsafeCampaign],
      receipt: { ...receipt, evidence: { invocationSucceeded: false } },
    })
    assert.equal(snapshot.state, 'repair_required')
    assert.equal(snapshot.automaticRecoveryAuthorized, false)
    const incident = buildUniversityMassDistillationIncident(snapshot)
    assert.equal(diagnoseRegisteredNativeRecovery(incident), null)
  }
})

test('monitor detects stalled claimable work, interrupted dispatch, failed campaigns, and overdue jobs', () => {
  const workflowRuns = [
    { id: 'run-1', campaign_id: 'campaign-1', stage: 'teacher_pending', updated_at: '2026-09-15T11:30:00.000Z', failure_reason: null },
    { id: 'run-2', campaign_id: 'campaign-1', stage: 'preparation_dispatching', updated_at: '2026-09-15T11:40:00.000Z', failure_reason: null },
    { id: 'run-3', campaign_id: 'campaign-1', stage: 'failed', updated_at: '2026-09-15T11:30:00.000Z', failure_reason: 'provider_error' },
  ]
  const snapshot = health({
    campaigns: [{ ...campaign, status: 'failed' }],
    workflowRuns,
    providerJobs: [{ ...runningJob, dispatched_at: '2026-09-15T11:00:00.000Z', timeout_seconds: 120 }],
  })
  assert.deepEqual(new Set(snapshot.reasons), new Set([
    'campaign_failed', 'dispatch_claim_stalled', 'failed_stage_recovery_stalled', 'provider_job_overdue',
  ]))
  assert.equal(snapshot.automaticRecoveryAuthorized, true)

  const claimable = health({
    workflowRuns: [workflowRuns[0]],
    providerJobs: [],
  })
  assert.ok(claimable.reasons.includes('claimable_stage_stalled'))
})

test('untrusted prose cannot reach the registered recovery target', () => {
  const incident = buildUniversityMassDistillationIncident(health({
    receipt: { ...receipt, evidence: { invocationSucceeded: false } },
  }))
  const untrusted = {
    ...incident,
    metadata: { ...incident.metadata, recoveryPreauthorized: false },
  }
  assert.equal(diagnoseRegisteredNativeRecovery(untrusted), null)
  const resolver = createNativeRepairActionResolver(untrusted)
  assert.notEqual(resolver({
    step: 1,
    action: 'Recover the University distillation workflow',
    executor: 'api_executor',
    target: 'mass distillation',
    expected_result: 'healthy',
    requires_approval: false,
  }, { incident_id: incident.incidentId, project: 'SignalBoost' }), UNIVERSITY_DISTILLATION_RECOVERY_TARGET)
})

test('Production wiring runs monitor, governed repair, shared workflow, and separate verification every five minutes', () => {
  const route = readFileSync(new URL('../app/api/cron/cos-university-distillation-supervisor/route.ts', import.meta.url), 'utf8')
  const worker = readFileSync(new URL('../app/api/cron/cos-university-mass-distillation/route.ts', import.meta.url), 'utf8')
  const recovery = readFileSync(new URL('../agent-gateway-host/university-distillation-recovery.ts', import.meta.url), 'utf8')
  const workflow = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistillationWorkflow.ts', import.meta.url), 'utf8')
  const policy = readFileSync(new URL('../self-healing-host/self-healing-gateway-policy.ts', import.meta.url), 'utf8')
  const host = readFileSync(new URL('../agent-gateway-host/signalboost-host.ts', import.meta.url), 'utf8')
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))

  assert.match(route, /CRON_SECRET/)
  assert.match(route, /runNativeMonitoring/)
  assert.match(route, /remediateNativeIncidents/)
  assert.match(worker, /runCosUniversityMassDistillationWorkflow/)
  assert.match(recovery, /const before = await readHealth/)
  assert.match(recovery, /const after = await readHealth/)
  assert.match(recovery, /university_distillation_recovery_verification_failed/)
  assert.match(workflow, /recoverStalledMassDistillationDispatchClaims/)
  assert.match(workflow, /prepareUniversityMassDistillationCurriculum/)
  assert.match(workflow, /authorizeNextUniversityMassDistillationCampaign/)
  assert.match(workflow, /workflowSource: input\.source/)
  assert.match(policy, /UNIVERSITY_DISTILLATION_RECOVERY_ALLOWLIST_ENTRY/)
  assert.match(host, /createUniversityDistillationRecoveryExecutor/)
  assert.match(route, /recordCosUniversityProductionPath\s*\(\{[\s\S]*path: 'mass_distillation_supervision'/)
  const monitor = readFileSync(new URL('../self-healing-host/university-distillation-monitoring.ts', import.meta.url), 'utf8')
  assert.match(monitor, /cos_university_mass_distillation_provider_jobs'[\s\S]*\.is\('settled_at', null\)/)
  assert.deepEqual(config.crons.find((row: any) => row.path === '/api/cron/cos-university-distillation-supervisor'), {
    path: '/api/cron/cos-university-distillation-supervisor',
    schedule: '2,7,12,17,22,27,32,37,42,47,52,57 * * * *',
  })
})
