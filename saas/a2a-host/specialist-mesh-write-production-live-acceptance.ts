import { createHash, randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import type { SupabaseClient } from '@supabase/supabase-js'
import { validateA2AAgentCard } from '../a2a-core/a2a-client.ts'
import { createInMemoryA2AAgentRegistry } from './a2a-agent-registry.ts'
import { createA2AHttpJsonRpcTransportFactory, fetchA2AAgentCard } from './a2a-http-jsonrpc-transport.ts'
import { createInMemoryA2ARuntimeObserver } from './a2a-runtime-observability.ts'
import { createPortableA2AHost } from './portable-a2a-host.ts'
import {
  PRIMARY_REFERENCE_WRITE_ACCEPTANCE_AGENT_ID,
  REFERENCE_WRITE_ACCEPTANCE_PROVIDER_ID,
  REFERENCE_WRITE_ACCEPTANCE_SKILL_ID,
  REFERENCE_WRITE_ACCEPTANCE_VERSION,
  SECONDARY_REFERENCE_WRITE_ACCEPTANCE_AGENT_ID,
  referenceWriteAcceptanceEndpoint,
  referenceWriteAcceptanceIdempotencyKey,
  type ReferenceWriteAcceptanceAgentId,
} from './reference-write-acceptance.ts'
import { createSupabaseSpecialistMeshProductionAdapters } from './specialist-mesh-production-adapters.ts'
import { createSupabaseSpecialistMeshWriteRecoveryStore, createSpecialistMeshWriteRecoveryProviderRegistry, specialistMeshWriteOperationKey } from './specialist-mesh-write-recovery.ts'
import { rankSpecialistMeshCandidates } from './specialist-mesh-router.ts'
import {
  SPECIALIST_MESH_WRITE_ACCEPTANCE_CONTROL_HEADER,
  createSpecialistMeshWriteAcceptanceControlToken,
  type SpecialistMeshWriteAcceptanceMode,
} from './specialist-mesh-write-acceptance-control.ts'
import { createSupervisorCoordinationStore } from '../lib/supervisor/coordination/durable-coordination-store.ts'
import type { OwnershipIdentity } from '../lib/supervisor/coordination/index.ts'

export const SPECIALIST_MESH_WRITE_PRODUCTION_LIVE_ACCEPTANCE_VERSION = 'signalboost-specialist-mesh-write-production-live-acceptance-v1' as const
export const SPECIALIST_MESH_WRITE_PRODUCTION_ACCEPTANCE_EVENT = 'specialist_mesh_write_recovery_live_acceptance_completed' as const

const TENANT_ID = 'signalboost-production'
const ENVIRONMENT_ID = 'production'
const PORTABLE_ID = 'specialist-mesh-write-live-acceptance'
const FAMILY_ID = 'marketing' as const
const SKILL_ID = REFERENCE_WRITE_ACCEPTANCE_SKILL_ID
const TRANSPORT_PRIMARY = 'signalboost-production-reference-write-primary-jsonrpc'
const TRANSPORT_SECONDARY = 'signalboost-production-reference-write-secondary-jsonrpc'
const MESSAGE_TEXT = 'Publish the isolated SignalBoost Phase 5 Production acceptance marker. No customer content or external provider is involved.'
const QUALIFICATION_VERIFIER_ID = 'signalboost-reference-write-acceptance-provenance-v1'

type Db = SupabaseClient<any, any, any>
type Scenario = 'already_applied' | 'safe_takeover' | 'unknown_outcome'

type AgentDescriptor = Readonly<{
  agentId: ReferenceWriteAcceptanceAgentId
  transportRef: string
  endpoint: string
  displayName: string
}>

type MeasuredCard = Readonly<{
  agentId: ReferenceWriteAcceptanceAgentId
  latencyMs: number
  latencyScore: number
  sourceRef: string
}>

function required(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized || normalized === '*') throw new Error(`specialist_mesh_write_acceptance_${name}_required`)
  return normalized
}

function descriptors(env: NodeJS.ProcessEnv = process.env): readonly [AgentDescriptor, AgentDescriptor] {
  return Object.freeze([
    Object.freeze({
      agentId: PRIMARY_REFERENCE_WRITE_ACCEPTANCE_AGENT_ID,
      transportRef: TRANSPORT_PRIMARY,
      endpoint: referenceWriteAcceptanceEndpoint(PRIMARY_REFERENCE_WRITE_ACCEPTANCE_AGENT_ID, env),
      displayName: 'SignalBoost Reference Write Acceptance Specialist A',
    }),
    Object.freeze({
      agentId: SECONDARY_REFERENCE_WRITE_ACCEPTANCE_AGENT_ID,
      transportRef: TRANSPORT_SECONDARY,
      endpoint: referenceWriteAcceptanceEndpoint(SECONDARY_REFERENCE_WRITE_ACCEPTANCE_AGENT_ID, env),
      displayName: 'SignalBoost Reference Write Acceptance Specialist B',
    }),
  ]) as readonly [AgentDescriptor, AgentDescriptor]
}

function registryFor(agents: readonly AgentDescriptor[]) {
  return createInMemoryA2AAgentRegistry({
    agents: agents.map(agent => ({
      agentId: agent.agentId,
      displayName: agent.displayName,
      description: 'SignalBoost-owned Production acceptance-only write specialist. It can mutate only the isolated reference acceptance provider.',
      transportRef: agent.transportRef,
      enabled: true,
      advertisedSkillIds: [SKILL_ID],
      metadata: { ownership: 'signalboost-reference', acceptanceClass: 'signalboost-production-live', referenceWriteAcceptanceOnly: true },
    })),
    assignments: agents.map((agent, index) => ({
      assignmentId: `production-write-live-acceptance-${index + 1}`,
      agentId: agent.agentId,
      tenantId: TENANT_ID,
      environmentId: ENVIRONMENT_ID,
      portableId: PORTABLE_ID,
      enabled: true,
      allowedSkills: [{ skillId: SKILL_ID, risk: 'write' as const }],
    })),
  })
}

function latencyScore(latencyMs: number): number {
  return Number(((Math.min(30_000, Math.max(0, latencyMs)) / 30_000) * 100).toFixed(3))
}

async function measureAgentCard(agent: AgentDescriptor): Promise<MeasuredCard> {
  const samples: number[] = []
  for (let index = 0; index < 3; index += 1) {
    const started = performance.now()
    const card = validateA2AAgentCard(await fetchA2AAgentCard({ url: agent.endpoint, timeoutMs: 10_000 }))
    const elapsed = Math.max(0, performance.now() - started)
    if (card.url !== agent.endpoint) throw new Error(`specialist_mesh_write_acceptance_agent_card_endpoint_mismatch:${agent.agentId}`)
    if (String(card.preferredTransport ?? 'JSONRPC').toUpperCase() !== 'JSONRPC') throw new Error(`specialist_mesh_write_acceptance_transport_unsupported:${agent.agentId}`)
    if (!card.skills.some(skill => skill.id === SKILL_ID)) throw new Error(`specialist_mesh_write_acceptance_skill_not_advertised:${agent.agentId}`)
    samples.push(elapsed)
  }
  samples.sort((a, b) => a - b)
  const latencyMs = Number(samples[Math.floor(samples.length / 2)]!.toFixed(3))
  return Object.freeze({
    agentId: agent.agentId,
    latencyMs,
    latencyScore: latencyScore(latencyMs),
    sourceRef: `production-write-live:${agent.agentId}:card-median-ms=${latencyMs}:reference-provider-cost-score=0`,
  })
}

async function persistReferenceQualifications(input: {
  db: Db
  agents: readonly AgentDescriptor[]
  productionCommit: string
  runId: string
  observedAt: Date
}): Promise<void> {
  const validUntil = new Date(input.observedAt.getTime() + 24 * 60 * 60_000).toISOString()
  const rows = input.agents.map(agent => {
    const digest = createHash('sha256').update(JSON.stringify({
      version: REFERENCE_WRITE_ACCEPTANCE_VERSION,
      agentId: agent.agentId,
      skillId: SKILL_ID,
      transportRef: agent.transportRef,
      productionCommit: input.productionCommit,
    }), 'utf8').digest('hex')
    return {
      qualification_key: `production-write-live:${input.runId}:${agent.agentId}`,
      tenant_id: TENANT_ID,
      environment_id: ENVIRONMENT_ID,
      portable_id: PORTABLE_ID,
      agent_id: agent.agentId,
      skill_id: SKILL_ID,
      qualified: true,
      evidence_ref: `sha256:${digest}`,
      verified_by: QUALIFICATION_VERIFIER_ID,
      valid_from: input.observedAt.toISOString(),
      valid_until: validUntil,
      observed_at: input.observedAt.toISOString(),
    }
  })
  const { error } = await input.db.from('a2a_specialist_qualifications').insert(rows)
  if (error) throw error
}

async function persistTelemetry(db: Db, measurements: readonly MeasuredCard[], runId: string, observedAt: Date): Promise<void> {
  const expiresAt = new Date(observedAt.getTime() + 15 * 60_000).toISOString()
  const rows = measurements.map(item => ({
    event_key: `production-write-live:${runId}:${item.agentId}`,
    tenant_id: TENANT_ID,
    environment_id: ENVIRONMENT_ID,
    portable_id: PORTABLE_ID,
    agent_id: item.agentId,
    skill_id: SKILL_ID,
    available: true,
    latency_score: item.latencyScore,
    cost_score: 0,
    load_score: null,
    reliability_score: null,
    quality_score: null,
    source_ref: item.sourceRef,
    observed_at: observedAt.toISOString(),
    expires_at: expiresAt,
  }))
  const { error } = await db.from('a2a_specialist_mesh_telemetry').insert(rows)
  if (error) throw error
}

function endpointResolver(input: {
  agents: readonly AgentDescriptor[]
  signingSecret: string
  taskId: string
  primaryAgentId: string
  primaryMode: SpecialistMeshWriteAcceptanceMode
}) {
  const byId = new Map(input.agents.map(agent => [agent.agentId, agent] as const))
  return Object.freeze({
    resolve(request: { agentId: string; transportRef: string }) {
      const agent = byId.get(request.agentId as ReferenceWriteAcceptanceAgentId)
      if (!agent || agent.transportRef !== request.transportRef) throw new Error('specialist_mesh_write_acceptance_transport_not_authorized')
      const mode: SpecialistMeshWriteAcceptanceMode = request.agentId === input.primaryAgentId ? input.primaryMode : 'normal'
      const token = createSpecialistMeshWriteAcceptanceControlToken({
        agentId: request.agentId,
        taskId: input.taskId,
        mode,
        signingSecret: input.signingSecret,
        ttlMs: 120_000,
      })
      return { endpoint: agent.endpoint, headers: { [SPECIALIST_MESH_WRITE_ACCEPTANCE_CONTROL_HEADER]: token } }
    },
  })
}

function providerRegistry(db: Db, forceUnknownOperationKey?: string) {
  return createSpecialistMeshWriteRecoveryProviderRegistry([{
    providerId: REFERENCE_WRITE_ACCEPTANCE_PROVIDER_ID,
    matches(input) {
      return input.skillId === SKILL_ID && (input.transportRef === TRANSPORT_PRIMARY || input.transportRef === TRANSPORT_SECONDARY)
    },
    idempotencyKey(input) {
      return referenceWriteAcceptanceIdempotencyKey(input.operationKey)
    },
    async reconcile(input) {
      const { data, error } = await db.rpc('a2a_specialist_mesh_write_acceptance_reconcile', {
        p_operation_key: input.operationKey,
        p_idempotency_key: input.idempotencyKey,
        p_force_unknown: forceUnknownOperationKey === input.operationKey,
      })
      if (error) throw new Error(`specialist_mesh_write_acceptance_provider_reconcile_failed:${error.message}`)
      const row = data && typeof data === 'object' ? data as Record<string, unknown> : {}
      const outcome = String(row.outcome ?? '')
      if (outcome !== 'applied' && outcome !== 'not_applied' && outcome !== 'unknown') {
        throw new Error('specialist_mesh_write_acceptance_provider_reconcile_invalid')
      }
      return Object.freeze({
        outcome,
        evidenceRef: required(row.evidence_ref, 'provider_evidence_ref'),
        providerOperationRef: required(row.provider_operation_ref ?? input.operationKey, 'provider_operation_ref'),
      })
    },
  }])
}

function operationKeyForTask(taskId: string): { meshTaskId: string; workItemId: string; operationKey: string } {
  const meshTaskId = [TENANT_ID, ENVIRONMENT_ID, PORTABLE_ID, taskId].join(':')
  return Object.freeze({
    meshTaskId,
    workItemId: `specialist-mesh:${meshTaskId}`,
    operationKey: specialistMeshWriteOperationKey({
      tenantId: TENANT_ID,
      environmentId: ENVIRONMENT_ID,
      portableId: PORTABLE_ID,
      taskId: meshTaskId,
      skillId: SKILL_ID,
    }),
  })
}

function leaseIdentity(row: any): OwnershipIdentity {
  return Object.freeze({
    leaseId: required(row?.lease_id, 'lease_id'),
    ownerInstanceId: required(row?.owner_instance_id, 'owner_instance_id'),
    ownerRuntimeId: required(row?.owner_runtime_id, 'owner_runtime_id'),
    fencingToken: Number(row?.fencing_token),
  })
}

async function rpcJson(db: Db, name: string, args: Record<string, unknown>): Promise<Record<string, any>> {
  const { data, error } = await db.rpc(name, args)
  if (error) throw error
  return data && typeof data === 'object' ? data as Record<string, any> : {}
}

async function runScenario(input: {
  db: Db
  registry: ReturnType<typeof registryFor>
  productionAdapters: ReturnType<typeof createSupabaseSpecialistMeshProductionAdapters>
  agents: readonly AgentDescriptor[]
  ranked: readonly { agentId: string; meshScore: number }[]
  signingSecret: string
  productionCommit: string
  runId: string
  scenario: Scenario
}) {
  const primaryAgentId = input.ranked[0]!.agentId
  const fallbackAgentId = input.ranked[1]!.agentId
  const taskId = `write-acceptance-${input.runId}-${input.scenario}`
  const traceId = `production-write-live-${input.runId}-${input.scenario}`
  const messageId = `production-write-live-${input.runId}-${input.scenario}`
  const keys = operationKeyForTask(taskId)
  const primaryMode: SpecialistMeshWriteAcceptanceMode = input.scenario === 'already_applied' ? 'after_apply_unavailable' : 'before_apply_unavailable'
  const forceUnknownOperationKey = input.scenario === 'unknown_outcome' ? keys.operationKey : undefined
  const transportFactory = createA2AHttpJsonRpcTransportFactory({
    connectionResolver: endpointResolver({
      agents: input.agents,
      signingSecret: input.signingSecret,
      taskId,
      primaryAgentId,
      primaryMode,
    }),
  })
  const observer = createInMemoryA2ARuntimeObserver()
  const coordinationStore = createSupervisorCoordinationStore({ supabase: input.db, runtime: 'production' })
  const host = createPortableA2AHost({
    registry: input.registry,
    transportFactory,
    qualifications: input.productionAdapters.qualifications,
    meshSignals: input.productionAdapters.meshSignals,
    observe: observer,
    meshCoordination: {
      store: coordinationStore,
      environment: 'production',
      policyVersion: SPECIALIST_MESH_WRITE_PRODUCTION_LIVE_ACCEPTANCE_VERSION,
      softwareVersion: input.productionCommit,
      writeRecovery: {
        providers: providerRegistry(input.db, forceUnknownOperationKey),
        store: createSupabaseSpecialistMeshWriteRecoveryStore(input.db),
      },
    },
    timeoutMs: 10_000,
  })

  const result = await host.orchestrator.orchestrate({
    tenantId: TENANT_ID,
    environmentId: ENVIRONMENT_ID,
    portableId: PORTABLE_ID,
    messageId,
    taskId,
    traceId,
    text: MESSAGE_TEXT,
    approval: {
      approvalId: `production-write-live-approval-${input.runId}-${input.scenario}`,
      approvedBy: 'signalboost-production-write-acceptance-control',
      approvedAt: new Date().toISOString(),
    },
    plan: { familyId: FAMILY_ID, skillId: SKILL_ID },
  })

  const observations = observer.snapshot().filter(event => event.traceId === traceId && event.skillId === SKILL_ID)
  const finalWork = await coordinationStore.getWorkItem(keys.workItemId)
  const { data: leaseRows, error: leaseError } = await input.db.from('supervisor_leases')
    .select('lease_id,work_item_id,owner_instance_id,owner_runtime_id,fencing_token,status,released_at,acquired_at')
    .eq('work_item_id', keys.workItemId)
    .order('fencing_token', { ascending: true })
  if (leaseError) throw leaseError
  const providerEvidence = await rpcJson(input.db, 'a2a_specialist_mesh_write_acceptance_evidence', { p_operation_key: keys.operationKey })
  const recoveryEvidence = await rpcJson(input.db, 'a2a_specialist_mesh_write_recovery_evidence', { p_operation_key: keys.operationKey })
  const attempts = Array.isArray(recoveryEvidence.attempts) ? recoveryEvidence.attempts : []
  const reconciliations = Array.isArray(providerEvidence.reconciliations) ? providerEvidence.reconciliations : []
  const effect = providerEvidence.effect && typeof providerEvidence.effect === 'object' ? providerEvidence.effect as Record<string, unknown> : null

  if (input.scenario === 'already_applied') {
    if (!result.ok || result.mode !== 'a2a_write_reconciled_applied') throw new Error(`specialist_mesh_write_acceptance_applied_result:${result.mode ?? 'unknown'}`)
    if (result.selectedAgentId !== primaryAgentId || result.meshAttemptedAgentIds?.length !== 1) throw new Error('specialist_mesh_write_acceptance_applied_replayed')
    if (!effect || effect.applied_by_agent !== primaryAgentId) throw new Error('specialist_mesh_write_acceptance_applied_effect_missing')
    if (attempts.length !== 1 || attempts[0]?.status !== 'applied') throw new Error('specialist_mesh_write_acceptance_applied_recovery_evidence_invalid')
    if (reconciliations.length !== 1 || reconciliations[0]?.outcome !== 'applied') throw new Error('specialist_mesh_write_acceptance_applied_provider_evidence_invalid')
    if (observations.length !== 1 || observations[0]?.mode !== 'a2a_transport_unavailable' || observations[0]?.executionAttempted !== true) throw new Error('specialist_mesh_write_acceptance_applied_ambiguity_not_observed')
    if (finalWork?.state !== 'completed' || !Array.isArray(leaseRows) || leaseRows.length !== 1) throw new Error('specialist_mesh_write_acceptance_applied_ownership_invalid')
  } else if (input.scenario === 'safe_takeover') {
    if (!result.ok || result.mode !== 'delegated' || result.selectedAgentId !== fallbackAgentId) throw new Error(`specialist_mesh_write_acceptance_takeover_result:${result.mode ?? 'unknown'}`)
    if (result.meshAttemptedAgentIds?.length !== 2 || result.meshAttemptedAgentIds[0] !== primaryAgentId || result.meshAttemptedAgentIds[1] !== fallbackAgentId) throw new Error('specialist_mesh_write_acceptance_takeover_order_invalid')
    if (!effect || effect.applied_by_agent !== fallbackAgentId) throw new Error('specialist_mesh_write_acceptance_takeover_effect_invalid')
    if (attempts.length !== 2 || attempts[0]?.status !== 'not_applied' || attempts[1]?.status !== 'applied') throw new Error('specialist_mesh_write_acceptance_takeover_recovery_evidence_invalid')
    if (reconciliations.length !== 2 || reconciliations[0]?.outcome !== 'not_applied' || reconciliations[1]?.outcome !== 'applied') throw new Error('specialist_mesh_write_acceptance_takeover_provider_evidence_invalid')
    if (observations.length !== 2 || observations[0]?.mode !== 'a2a_transport_unavailable' || observations[1]?.mode !== 'delegated') throw new Error('specialist_mesh_write_acceptance_takeover_transport_evidence_invalid')
    if (finalWork?.state !== 'completed' || !Array.isArray(leaseRows) || leaseRows.length !== 2) throw new Error('specialist_mesh_write_acceptance_takeover_ownership_invalid')
    if (Number(leaseRows[1]?.fencing_token) <= Number(leaseRows[0]?.fencing_token)) throw new Error('specialist_mesh_write_acceptance_takeover_fence_not_advanced')
    let staleRejected = false
    try {
      await coordinationStore.assertFence(keys.workItemId, leaseIdentity(leaseRows[0]), new Date())
    } catch (error: any) {
      staleRejected = error?.code === 'stale_owner_rejected' || /stale/i.test(String(error?.message ?? ''))
      if (!staleRejected) throw error
    }
    if (!staleRejected) throw new Error('specialist_mesh_write_acceptance_takeover_stale_owner_not_rejected')
  } else {
    if (result.ok || result.mode !== 'a2a_write_outcome_ambiguous') throw new Error(`specialist_mesh_write_acceptance_unknown_result:${result.mode ?? 'unknown'}`)
    if (result.meshAttemptedAgentIds?.length !== 1 || result.meshAttemptedAgentIds[0] !== primaryAgentId) throw new Error('specialist_mesh_write_acceptance_unknown_replayed')
    if (effect) throw new Error('specialist_mesh_write_acceptance_unknown_effect_unexpected')
    if (attempts.length !== 1 || attempts[0]?.status !== 'unknown') throw new Error('specialist_mesh_write_acceptance_unknown_recovery_evidence_invalid')
    if (reconciliations.length !== 1 || reconciliations[0]?.outcome !== 'unknown') throw new Error('specialist_mesh_write_acceptance_unknown_provider_evidence_invalid')
    if (observations.length !== 1 || observations[0]?.mode !== 'a2a_transport_unavailable') throw new Error('specialist_mesh_write_acceptance_unknown_transport_evidence_invalid')
    if (finalWork?.state !== 'failed' || !Array.isArray(leaseRows) || leaseRows.length !== 1) throw new Error('specialist_mesh_write_acceptance_unknown_ownership_invalid')
  }

  return Object.freeze({
    scenario: input.scenario,
    taskId,
    traceId,
    operationKey: keys.operationKey,
    workItemId: keys.workItemId,
    resultMode: result.mode,
    attemptedAgentIds: Object.freeze([...(result.meshAttemptedAgentIds ?? [])]),
    effectAppliedByAgent: effect ? String(effect.applied_by_agent ?? '') : null,
    recoveryStatuses: Object.freeze(attempts.map((row: any) => String(row?.status ?? ''))),
    providerOutcomes: Object.freeze(reconciliations.map((row: any) => String(row?.outcome ?? ''))),
    fencingTokens: Object.freeze((leaseRows ?? []).map((row: any) => Number(row?.fencing_token))),
    finalState: finalWork?.state ?? 'missing',
    observationModes: Object.freeze(observations.map(row => row.mode)),
  })
}

export async function runSpecialistMeshWriteProductionLiveAcceptance(input: {
  db: Db
  signingSecret: string
  productionCommit: string
  env?: NodeJS.ProcessEnv
}) {
  const productionCommit = required(input.productionCommit, 'production_commit')
  const signingSecret = required(input.signingSecret, 'signing_secret')
  const runId = randomUUID()
  const startedAt = new Date()
  const agents = descriptors(input.env)
  const registry = registryFor(agents)

  const measurements = await Promise.all(agents.map(measureAgentCard))
  await persistReferenceQualifications({ db: input.db, agents, productionCommit, runId, observedAt: startedAt })
  await persistTelemetry(input.db, measurements, runId, startedAt)

  const productionAdapters = createSupabaseSpecialistMeshProductionAdapters(input.db)
  const agentIds = agents.map(agent => agent.agentId)
  const qualifications = await productionAdapters.qualifications.snapshot({
    tenantId: TENANT_ID,
    environmentId: ENVIRONMENT_ID,
    portableId: PORTABLE_ID,
    skillId: SKILL_ID,
    agentIds,
  })
  if (agentIds.some(agentId => qualifications[agentId]?.qualified !== true || !String(qualifications[agentId]?.evidenceRef ?? '').trim())) {
    throw new Error('specialist_mesh_write_acceptance_exact_two_qualifications_missing')
  }
  if (qualifications[agentIds[0]!]!.evidenceRef === qualifications[agentIds[1]!]!.evidenceRef) {
    throw new Error('specialist_mesh_write_acceptance_independent_qualification_evidence_required')
  }

  const signals = await productionAdapters.meshSignals.snapshot({
    tenantId: TENANT_ID,
    environmentId: ENVIRONMENT_ID,
    portableId: PORTABLE_ID,
    skillId: SKILL_ID,
    agentIds,
  })
  const ranked = rankSpecialistMeshCandidates(agentIds.map(agentId => ({ agentId })), signals)
  if (ranked.length !== 2) throw new Error(`specialist_mesh_write_acceptance_exact_two_routable_required:${ranked.length}`)

  const alreadyApplied = await runScenario({ db: input.db, registry, productionAdapters, agents, ranked, signingSecret, productionCommit, runId, scenario: 'already_applied' })
  const safeTakeover = await runScenario({ db: input.db, registry, productionAdapters, agents, ranked, signingSecret, productionCommit, runId, scenario: 'safe_takeover' })
  const unknownOutcome = await runScenario({ db: input.db, registry, productionAdapters, agents, ranked, signingSecret, productionCommit, runId, scenario: 'unknown_outcome' })

  const acceptedAt = new Date().toISOString()
  const evidence = Object.freeze({
    schemaVersion: SPECIALIST_MESH_WRITE_PRODUCTION_LIVE_ACCEPTANCE_VERSION,
    acceptanceClass: 'signalboost-production-live',
    buyerAccepted: false,
    externalProviderAccepted: false,
    referenceProviderOnly: true,
    runId,
    acceptedAt,
    productionCommit,
    scope: {
      tenantId: TENANT_ID,
      environmentId: ENVIRONMENT_ID,
      portableId: PORTABLE_ID,
      familyId: FAMILY_ID,
      skillId: SKILL_ID,
      providerId: REFERENCE_WRITE_ACCEPTANCE_PROVIDER_ID,
    },
    routing: {
      primaryAgentId: ranked[0]!.agentId,
      fallbackAgentId: ranked[1]!.agentId,
      primaryMeshScore: ranked[0]!.meshScore,
      fallbackMeshScore: ranked[1]!.meshScore,
    },
    qualification: {
      verifierId: QUALIFICATION_VERIFIER_ID,
      exactScopeReferenceQualification: true,
      customerOrBuyerQualificationClaimed: false,
    },
    scenarios: { alreadyApplied, safeTakeover, unknownOutcome },
    security: {
      signedTaskBoundAcceptanceControls: true,
      isolatedReferenceProvider: true,
      customerContentTouched: false,
      externalProviderTouched: false,
      authorityWidened: false,
      unknownOutcomeFailsClosed: true,
    },
  })

  const eventId = `specialist-mesh-write-production-live-${runId}`
  const { error: auditError } = await input.db.from('supervisor_audit_events').insert({
    event_id: eventId,
    execution_id: `production-write-live-${runId}`,
    incident_id: safeTakeover.workItemId,
    event_type: SPECIALIST_MESH_WRITE_PRODUCTION_ACCEPTANCE_EVENT,
    occurred_at: acceptedAt,
    payload: evidence,
    schema_version: SPECIALIST_MESH_WRITE_PRODUCTION_LIVE_ACCEPTANCE_VERSION,
  })
  if (auditError) throw auditError

  return Object.freeze({ eventId, evidence })
}
