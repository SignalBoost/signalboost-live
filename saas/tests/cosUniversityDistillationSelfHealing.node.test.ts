// saas/tests/cosUniversityDistillationSelfHealing.node.test.ts
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
import {
  lineRepairPlan,
  onlyDeferredLineReasonsRemain,
  runLineStationRepair,
} from '../lib/ai/cos/cosUniversityLineRepairPlan.ts'

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

test('newer no-op maintenance does not hide an unresolved packaging contradiction', () => {
  const progress = deriveCurriculumPackagingProgress([{
    observed_at: '2026-09-15T11:59:00.000Z',
    commit_sha: 'new-no-op',
    evidence: {
      slowMaintenanceDue: true,
      preparedBeforeReplenishment: 0,
      preparedAfterReplenishment: 0,
      curriculum: { batchesPrepared: 0, supply: { subjects: [] } },
      curriculumReplenishment: {},
    },
  }, {
    observed_at: '2026-09-15T11:56:00.000Z',
    commit_sha: 'stalled',
    evidence: {
      slowMaintenanceDue: true,
      preparedBeforeReplenishment: 0,
      preparedAfterReplenishment: 0,
      curriculum: { batchesPrepared: 0, supply: { subjects: [{ subject: 'Statistics & Data Science', shortfallToBatch: 16 }] } },
      curriculumReplenishment: { syntheticBySubject: [{ subject: 'Statistics & Data Science', inserted: 16 }] },
    },
  }])
  assert.equal(progress.stalled, true)
  assert.equal(progress.observedAt, '2026-09-15T11:56:00.000Z')
  assert.equal(progress.subject, 'Statistics & Data Science')
})

test('packaging repair takes precedence over paid authorization and rolling-budget gates', () => {
  const progress = {
    stalled: true,
    observedAt: '2026-09-15T11:56:00.000Z',
    subject: 'Statistics & Data Science',
    shortfallToBatch: 16,
    insertedForSubject: 16,
    preparedBefore: 0,
    preparedAfter: 0,
  }
  for (const continuity of [{
    preparedBatches: 0,
    rollingPolicyEnabled: false,
    rollingMaximumAuthorizedCostUsd: 0,
    rollingAuthorizedCostUsd: 0,
    nextBudgetReleaseAt: null,
  }, {
    preparedBatches: 0,
    rollingPolicyEnabled: true,
    rollingMaximumAuthorizedCostUsd: 25,
    rollingAuthorizedCostUsd: 25,
    nextBudgetReleaseAt: '2026-09-16T16:31:41.969Z',
  }]) {
    const snapshot = evaluateUniversityMassDistillationHealth({
      now,
      expectedIntervalSeconds: 300,
      campaigns: [],
      receipt,
      workflowRuns: [],
      providerJobs: [],
      curriculumProgress: progress,
      continuity,
    })
    assert.equal(snapshot.state, 'repair_required')
    assert.deepEqual(snapshot.reasons, ['curriculum_packaging_stalled'])
    assert.equal(snapshot.automaticRecoveryAuthorized, true)
  }
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

test('terminalized failed campaigns and their failed runs are historical, not live repair incidents', () => {
  const terminal = {
    ...campaign,
    status: 'failed',
    completed_at: '2026-09-15T11:45:00.000Z',
  }
  const snapshot = health({
    campaigns: [terminal],
    workflowRuns: [{
      id: 'terminal-run',
      campaign_id: terminal.id,
      stage: 'failed',
      updated_at: '2026-09-15T10:00:00.000Z',
      failure_reason: 'campaign_budget_exhausted',
    }],
    providerJobs: [],
    continuity: {
      preparedBatches: 0,
      rollingPolicyEnabled: true,
      rollingMaximumAuthorizedCostUsd: null,
      rollingAuthorizedCostUsd: 5,
      nextBudgetReleaseAt: null,
    },
  })
  assert.equal(snapshot.failedCampaigns, 0)
  assert.equal(snapshot.failedRuns, 0)
  assert.ok(!snapshot.reasons.includes('campaign_failed'))
  assert.ok(!snapshot.reasons.includes('failed_stage_recovery_stalled'))
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
  // Renamed 2026-09 when campaign authorization became batched. Pinning the OLD name left this test red on
  // main for days with nothing running it, which is why it is now gated in CI.
  assert.match(workflow, /authorizeAvailableUniversityMassDistillationCampaigns/)
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

// ---------------------------------------------------------------------------------------------------------------
// Repair what is actually stalled.
//
// Owner 2026-10-02: "self healing supervisor never proved that it works, and you want it to be responsible for the
// whole thing?" He was right, and these tests exist because of a defect I introduced. Wiring the lifecycle stall
// watcher into the monitor added four reasons to the snapshot without checking what the governed repair does with
// one. Read in sequence, the live code ran the TRAINING workflow - entirely upstream of the artifact existing - at a
// stalled quarantine, then re-read health, found the reason still there, and THREW
// `university_distillation_recovery_verification_failed`. Every five minutes, forever: paid work that cannot fix the
// fault, followed by a self-inflicted verification failure.
//
// The tests below prove the routing, and prove the one thing a supervisor must never fake: a woken station has not
// finished working, so the repair is reported as DEFERRED and never as verified.
// ---------------------------------------------------------------------------------------------------------------
test('each lifecycle stall is routed to the station that can actually clear it', () => {
  for (const [reason, station] of [
    ['lifecycle_exam_stalled', 'INDEPENDENT_EVALUATION'],
    ['lifecycle_quarantine_stalled', 'QUARANTINE_REMEDIATION'],
    ['lifecycle_registration_stalled', 'GRADUATION'],
    ['lifecycle_activation_stalled', 'GRADUATION'],
  ] as Array<[string, string]>) {
    const plan = lineRepairPlan({ reasons: [reason] })
    assert.equal(plan.target, 'assembly_line', reason)
    assert.equal(plan.stations.length, 1)
    assert.equal(plan.stations[0].station, station)
    assert.match(plan.stations[0].workerPath, /^\/api\/cron\//)
    assert.ok(plan.stations[0].slaSeconds > 0)
    // A woken station needs time. The plan must say so rather than inviting an instant verification.
    assert.equal(plan.verificationDeferred, true)
    assert.ok(plan.deferredForSeconds > 0)
    assert.equal(plan.authorityExpanded, false)
  }
})

test('two stalls on the same station wake it once, not twice', () => {
  const plan = lineRepairPlan({ reasons: ['lifecycle_registration_stalled', 'lifecycle_activation_stalled'] })
  assert.equal(plan.stations.length, 1)
  assert.equal(plan.stations[0].station, 'GRADUATION')
  assert.deepEqual([...plan.stations[0].reasons], ['lifecycle_registration_stalled', 'lifecycle_activation_stalled'])
})

test('an upstream reason still goes to the training workflow, and wakes no station', () => {
  const plan = lineRepairPlan({ reasons: ['dispatch_claim_stalled', 'heartbeat_stale'] })
  assert.equal(plan.target, 'training_workflow')
  assert.deepEqual(plan.stations, [])
  assert.equal(plan.verificationDeferred, false)
  assert.equal(plan.deferredForSeconds, 0)
})

test('a mixed snapshot repairs the line AND the training workflow', () => {
  const plan = lineRepairPlan({ reasons: ['lifecycle_quarantine_stalled', 'heartbeat_missing'] })
  assert.equal(plan.target, 'both')
  assert.equal(plan.stations.length, 1)
  assert.deepEqual([...plan.upstreamReasons], ['heartbeat_missing'])
})

test('an unrecognised reason is treated as upstream, never dropped', () => {
  // A reason this module has not heard of must still reach a repair that exists. Silently excluding it is how a
  // fault becomes invisible.
  const plan = lineRepairPlan({ reasons: ['some_future_reason'] })
  assert.equal(plan.target, 'training_workflow')
  assert.deepEqual([...plan.upstreamReasons], ['some_future_reason'])
  assert.equal(lineRepairPlan({ reasons: [] }).target, 'none')
  assert.equal(lineRepairPlan({ reasons: ['', '  '] }).target, 'none')
})

test('only an all-line reason set counts as a deferred wait', () => {
  assert.equal(onlyDeferredLineReasonsRemain({ reasons: ['lifecycle_exam_stalled'] }), true)
  assert.equal(onlyDeferredLineReasonsRemain({ reasons: ['lifecycle_exam_stalled', 'lifecycle_activation_stalled'] }), true)
  assert.equal(onlyDeferredLineReasonsRemain({ reasons: ['lifecycle_exam_stalled', 'heartbeat_stale'] }), false)
  // An empty set is not "waiting"; it is healthy, and that is the other branch's answer.
  assert.equal(onlyDeferredLineReasonsRemain({ reasons: [] }), false)
})

test('a lifecycle stall wakes its station, spends nothing, and is reported as deferred rather than verified', async () => {
  // The proof the owner asked for. A quarantine stall must wake the quarantine station, must leave nothing for the
  // paid path to do, and must NOT be dressed up as a confirmed repair while that station is still working.
  const woken: string[] = []
  const outcome = await runLineStationRepair({
    reasons: ['lifecycle_quarantine_stalled'],
    wake: async ({ path }) => { woken.push(path); return { ok: true, status: 200, detail: 'woken' } },
    // Health still carries the same line reason a moment later, because the station has not finished.
    readHealth: async () => ({ state: 'repair_required', reasons: ['lifecycle_quarantine_stalled'] }),
    recordReceipt: async () => 'receipt-ref',
  })

  assert.deepEqual(woken, ['/api/cron/cos-university-mass-backlog-compact'], 'the quarantine station must be woken')
  assert.equal(outcome.attempted, true)
  assert.equal(outcome.settled, false, 'a station woken a moment ago has not finished working')
  assert.equal(outcome.verificationDeferred, true)
  assert.ok(outcome.deferredForSeconds > 0)
  assert.equal(outcome.paidDispatchSuppressed, true, 'paid training must have nothing to do at a line stall')
  assert.equal(outcome.receiptRef, 'receipt-ref')
  assert.equal(outcome.authorityExpanded, false)
  assert.ok(Object.isFrozen(outcome))
})

test('a line stall that clears immediately IS reported as verified', async () => {
  // The deferral must not become a blanket excuse. When health genuinely comes back clean, say so.
  const outcome = await runLineStationRepair({
    reasons: ['lifecycle_registration_stalled'],
    wake: async () => ({ ok: true, status: 200, detail: 'woken' }),
    readHealth: async () => ({ state: 'healthy', reasons: [] }),
  })
  assert.equal(outcome.settled, true)
  assert.equal(outcome.verificationDeferred, false)
  assert.equal(outcome.deferredForSeconds, 0)
  assert.equal(outcome.paidDispatchSuppressed, true)
  assert.equal(outcome.receiptRef, null, 'no receipt recorder was supplied, so none may be invented')
})

test('an upstream reason left over after a line repair still reaches the paid path', async () => {
  // Mixed faults: the line is poked for free, and the training workflow must still get its turn.
  const outcome = await runLineStationRepair({
    reasons: ['lifecycle_exam_stalled', 'heartbeat_stale'],
    wake: async () => ({ ok: true, status: 200, detail: 'woken' }),
    readHealth: async () => ({ state: 'repair_required', reasons: ['heartbeat_stale'] }),
  })
  assert.equal(outcome.attempted, true)
  assert.equal(outcome.paidDispatchSuppressed, false, 'an upstream fault must not be swallowed by the line repair')
  assert.equal(outcome.verificationDeferred, false)
})

test('a station that refuses to wake is reported as not woken, and never throws', async () => {
  // A supervisor that throws on a failed poke stops supervising. The honest outcome is a recorded failure.
  const outcome = await runLineStationRepair({
    reasons: ['lifecycle_activation_stalled'],
    wake: async () => { throw new Error('connect ECONNREFUSED') },
    readHealth: async () => ({ state: 'repair_required', reasons: ['lifecycle_activation_stalled'] }),
  })
  assert.equal(outcome.attempted, true)
  assert.equal(outcome.stations.length, 1)
  assert.equal(outcome.stations[0].woken, false)
  assert.match(outcome.stations[0].detail, /ECONNREFUSED/)
})

test('a snapshot with no line reason wakes nothing at all', async () => {
  let wakes = 0
  const outcome = await runLineStationRepair({
    reasons: ['dispatch_claim_stalled'],
    wake: async () => { wakes += 1; return { ok: true } },
    readHealth: async () => { throw new Error('health must not even be re-read') },
  })
  assert.equal(wakes, 0)
  assert.equal(outcome.attempted, false)
  assert.equal(outcome.paidDispatchSuppressed, false)
  assert.equal(outcome.verificationDeferred, false)
})

test('the live repair wakes the line before anything paid, and never throws on a deferred wait', () => {
  const recovery = readFileSync(new URL('../agent-gateway-host/university-distillation-recovery.ts', import.meta.url), 'utf8')
  const lineAt = recovery.indexOf('const lineRepair = await runLineStationRepair(')
  const paidAt = recovery.indexOf('const workerPreflight = await preflightWorker()')
  assert.ok(lineAt > 0 && paidAt > lineAt, 'the zero-spend line repair must come before the paid path')
  assert.match(recovery, /if \(lineRepair\.attempted && lineRepair\.paidDispatchSuppressed\) \{/)
  assert.match(recovery, /onlyDeferredLineReasonsRemain\(\{ reasons: after\.reasons \}\)/)
  assert.match(recovery, /if \(!verified && !deferred\) \{/)
  assert.match(recovery, /verified: lineRepair\.settled,/, 'a woken station must never be reported as verified')
  assert.match(recovery, /paidDispatchSuppressed: true/)
  assert.match(recovery, /authorityExpanded: false/)
  assert.doesNotMatch(recovery, /automaticPromotionAuthorized: true/)
  assert.doesNotMatch(recovery, /runpodMutationAuthorized: true/)
})
// end of saas/tests/cosUniversityDistillationSelfHealing.node.test.ts (if this line is missing, the paste was cut short)
