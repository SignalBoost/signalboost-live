import { createHash, randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import type { SupabaseClient } from '@supabase/supabase-js'
import { validateA2AAgentCard } from '../a2a-core/a2a-client.ts'
import { createInMemoryA2AAgentRegistry, type A2ATransportFactory } from './a2a-agent-registry.ts'
import { createA2AHttpJsonRpcTransportFactory, fetchA2AAgentCard } from './a2a-http-jsonrpc-transport.ts'
import { createInMemoryA2ARuntimeObserver } from './a2a-runtime-observability.ts'
import { createPortableA2AHost } from './portable-a2a-host.ts'
import { referenceDiagnosticEndpoint } from './reference-a2a-config.ts'
import { REFERENCE_DIAGNOSTIC_AGENT_ID, REFERENCE_DIAGNOSTIC_SKILL_ID } from './reference-self-healing-diagnostic.ts'
import { SECONDARY_REFERENCE_DIAGNOSTIC_AGENT_ID } from './reference-secondary-diagnostic.ts'
import {
  SPECIALIST_MESH_ACCEPTANCE_FAILURE_HEADER,
  createSpecialistMeshAcceptanceFailureToken,
} from './specialist-mesh-acceptance-control.ts'
import { createSupabaseSpecialistMeshProductionAdapters } from './specialist-mesh-production-adapters.ts'
import { rankSpecialistMeshCandidates } from './specialist-mesh-router.ts'
import {
  persistSupabaseSpecialistQualificationAssessment,
  runSpecialistQualificationAssessment,
  type SpecialistQualificationVerifier,
} from './specialist-qualification-assessment.ts'
import { createSupervisorCoordinationStore } from '../lib/supervisor/coordination/durable-coordination-store.ts'
import type { OwnershipIdentity } from '../lib/supervisor/coordination/index.ts'

export const SPECIALIST_MESH_PRODUCTION_LIVE_ACCEPTANCE_VERSION = 'signalboost-specialist-mesh-production-live-acceptance-v1' as const
export const SPECIALIST_MESH_PRODUCTION_ACCEPTANCE_EVENT = 'specialist_mesh_live_acceptance_completed' as const

const TENANT_ID = 'signalboost-production'
const ENVIRONMENT_ID = 'production'
const PORTABLE_ID = 'specialist-mesh-live-acceptance'
const FAMILY_ID = 'self-healing-diagnostic' as const
const SKILL_ID = REFERENCE_DIAGNOSTIC_SKILL_ID
const VERIFIER_ID = 'signalboost-production-specialist-qualification-verifier-v1'
const TRANSPORT_PRIMARY = 'signalboost-production-reference-primary-jsonrpc'
const TRANSPORT_SECONDARY = 'signalboost-production-reference-secondary-jsonrpc'
const QUALIFICATION_PROBE = 'Observed evidence: production API requests return 504 gateway timeout after an upstream dependency latency increase. Classify the failure and recommend bounded next diagnostic checks.'
const FAILOVER_MESSAGE = 'Production API requests return 504 gateway timeout after an upstream dependency latency increase. Diagnose the likely failure class and bounded next checks.'

type Db = SupabaseClient<any, any, any>
type AgentDescriptor = Readonly<{ agentId: string; transportRef: string; endpoint: string; displayName: string }>

type MeasuredCard = Readonly<{
  agentId: string
  latencyMs: number
  latencyScore: number
  costScore: 0
  sourceRef: string
}>

function required(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized || normalized === '*') throw new Error(`specialist mesh production acceptance ${name} is required`)
  return normalized
}

function secondaryEndpoint(env: NodeJS.ProcessEnv = process.env): string {
  const primary = new URL(referenceDiagnosticEndpoint(env))
  primary.pathname = '/api/a2a/reference-diagnostic-secondary'
  primary.search = ''
  primary.hash = ''
  return primary.toString()
}

function descriptors(env: NodeJS.ProcessEnv = process.env): readonly [AgentDescriptor, AgentDescriptor] {
  return Object.freeze([
    Object.freeze({
      agentId: REFERENCE_DIAGNOSTIC_AGENT_ID,
      transportRef: TRANSPORT_PRIMARY,
      endpoint: referenceDiagnosticEndpoint(env),
      displayName: 'SignalBoost Reference Self-Healing Diagnostic Specialist',
    }),
    Object.freeze({
      agentId: SECONDARY_REFERENCE_DIAGNOSTIC_AGENT_ID,
      transportRef: TRANSPORT_SECONDARY,
      endpoint: secondaryEndpoint(env),
      displayName: 'SignalBoost Reference Self-Healing Verification Diagnostic Specialist',
    }),
  ]) as readonly [AgentDescriptor, AgentDescriptor]
}

function registryFor(agents: readonly AgentDescriptor[]) {
  return createInMemoryA2AAgentRegistry({
    agents: agents.map(agent => ({
      agentId: agent.agentId,
      displayName: agent.displayName,
      description: 'Read-only Production reference specialist for governed Specialist Mesh acceptance.',
      transportRef: agent.transportRef,
      enabled: true,
      advertisedSkillIds: [SKILL_ID],
      metadata: { ownership: 'signalboost-reference', acceptanceClass: 'signalboost-production-live' },
    })),
    assignments: agents.map((agent, index) => ({
      assignmentId: `production-live-acceptance-${index + 1}`,
      agentId: agent.agentId,
      tenantId: TENANT_ID,
      environmentId: ENVIRONMENT_ID,
      portableId: PORTABLE_ID,
      enabled: true,
      allowedSkills: [{ skillId: SKILL_ID, risk: 'advisory' as const }],
    })),
  })
}

function endpointResolver(agents: readonly AgentDescriptor[], failure?: { agentId: string; token: string }) {
  const byId = new Map(agents.map(agent => [agent.agentId, agent] as const))
  return Object.freeze({
    resolve(input: { agentId: string; transportRef: string }) {
      const agent = byId.get(input.agentId)
      if (!agent || agent.transportRef !== input.transportRef) throw new Error('specialist_mesh_production_acceptance_transport_not_authorized')
      return {
        endpoint: agent.endpoint,
        ...(failure?.agentId === agent.agentId ? { headers: { [SPECIALIST_MESH_ACCEPTANCE_FAILURE_HEADER]: failure.token } } : {}),
      }
    },
  })
}

function artifactPayload(response: Readonly<Record<string, unknown>>): Record<string, unknown> | null {
  const artifacts = Array.isArray((response as any).artifacts) ? (response as any).artifacts : []
  for (const artifact of artifacts) {
    const parts = Array.isArray(artifact?.parts) ? artifact.parts : []
    for (const part of parts) {
      if (part?.kind !== 'text' || typeof part?.text !== 'string') continue
      try {
        const parsed = JSON.parse(part.text)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
      } catch { /* continue */ }
    }
  }
  return null
}

function qualificationVerifier(): SpecialistQualificationVerifier {
  return Object.freeze({
    async verify(input) {
      const payload = artifactPayload(input.response)
      const status = (input.response as any)?.status?.state
      const checks = Array.isArray(payload?.recommendedNextChecks) ? payload!.recommendedNextChecks : []
      const qualified = Boolean(
        status === 'completed'
        && payload?.advisoryOnly === true
        && payload?.specialist === input.agentId
        && payload?.skill === input.skillId
        && payload?.classification === 'upstream_timeout_or_network'
        && typeof payload?.confidence === 'number'
        && Number(payload.confidence) >= 0.5
        && checks.length >= 2,
      )
      const digest = createHash('sha256').update(JSON.stringify({
        agentId: input.agentId,
        skillId: input.skillId,
        qualified,
        classification: payload?.classification ?? null,
        confidence: payload?.confidence ?? null,
        checkCount: checks.length,
        status: status ?? null,
      }), 'utf8').digest('hex')
      return Object.freeze({ qualified, verifierId: VERIFIER_ID, evidenceRef: `sha256:${digest}` })
    },
  })
}

function latencyScore(latencyMs: number): number {
  return Number(((Math.min(30_000, Math.max(0, latencyMs)) / 30_000) * 100).toFixed(3))
}

async function measureAgentCard(agent: AgentDescriptor, runId: string): Promise<MeasuredCard> {
  const samples: number[] = []
  for (let index = 0; index < 3; index += 1) {
    const started = performance.now()
    const card = validateA2AAgentCard(await fetchA2AAgentCard({ url: agent.endpoint, timeoutMs: 10_000 }))
    const elapsed = Math.max(0, performance.now() - started)
    if (card.url !== agent.endpoint) throw new Error(`specialist_mesh_production_acceptance_agent_card_endpoint_mismatch:${agent.agentId}`)
    if (String(card.preferredTransport ?? 'JSONRPC').toUpperCase() !== 'JSONRPC') throw new Error(`specialist_mesh_production_acceptance_transport_unsupported:${agent.agentId}`)
    if (!card.skills.some(skill => skill.id === SKILL_ID)) throw new Error(`specialist_mesh_production_acceptance_skill_not_advertised:${agent.agentId}`)
    samples.push(elapsed)
  }
  samples.sort((a, b) => a - b)
  const latencyMs = Number(samples[Math.floor(samples.length / 2)]!.toFixed(3))
  return Object.freeze({
    agentId: agent.agentId,
    latencyMs,
    latencyScore: latencyScore(latencyMs),
    costScore: 0,
    sourceRef: `production-live:${runId}:${agent.agentId}:card-median-ms=${latencyMs}:provider-cost-score=0`,
  })
}

async function persistTelemetry(db: Db, measurements: readonly MeasuredCard[], runId: string, observedAt: Date): Promise<void> {
  const expiresAt = new Date(observedAt.getTime() + 15 * 60_000).toISOString()
  const rows = measurements.map(item => ({
    event_key: `production-live:${runId}:${item.agentId}`,
    tenant_id: TENANT_ID,
    environment_id: ENVIRONMENT_ID,
    portable_id: PORTABLE_ID,
    agent_id: item.agentId,
    skill_id: SKILL_ID,
    available: true,
    latency_score: item.latencyScore,
    cost_score: item.costScore,
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

async function persistQualifications(input: {
  db: Db
  registry: ReturnType<typeof registryFor>
  transportFactory: A2ATransportFactory
  agents: readonly AgentDescriptor[]
  runId: string
}): Promise<void> {
  const verifier = qualificationVerifier()
  for (const agent of input.agents) {
    const record = await runSpecialistQualificationAssessment({
      registry: input.registry,
      transportFactory: input.transportFactory,
      verifier,
      tenantId: TENANT_ID,
      environmentId: ENVIRONMENT_ID,
      portableId: PORTABLE_ID,
      agentId: agent.agentId,
      skillId: SKILL_ID,
      assessmentId: `production-live:${input.runId}:${agent.agentId}`,
      messageId: `qualification:${input.runId}:${agent.agentId}`,
      probeText: QUALIFICATION_PROBE,
      timeoutMs: 10_000,
      validForMs: 86_400_000,
    })
    if (!record.qualified) throw new Error(`specialist_mesh_production_acceptance_qualification_failed:${agent.agentId}`)
    await persistSupabaseSpecialistQualificationAssessment(input.db, record)
  }
}

function leaseIdentity(row: any): OwnershipIdentity {
  return Object.freeze({
    leaseId: required(row?.lease_id, 'lease.lease_id'),
    ownerInstanceId: required(row?.owner_instance_id, 'lease.owner_instance_id'),
    ownerRuntimeId: required(row?.owner_runtime_id, 'lease.owner_runtime_id'),
    fencingToken: Number(row?.fencing_token),
  })
}

export async function runSpecialistMeshProductionLiveAcceptance(input: {
  db: Db
  failureControlSecret: string
  productionCommit: string
  env?: NodeJS.ProcessEnv
}) {
  const productionCommit = required(input.productionCommit, 'productionCommit')
  const failureControlSecret = required(input.failureControlSecret, 'failureControlSecret')
  const runId = randomUUID()
  const traceId = `production-live-${runId}`
  const messageId = `production-live-${runId}`
  const startedAt = new Date()
  const agents = descriptors(input.env)
  const registry = registryFor(agents)
  const normalTransport = createA2AHttpJsonRpcTransportFactory({ connectionResolver: endpointResolver(agents) })

  // Qualification is independent per worker and is based on an actual advisory transport execution.
  await persistQualifications({ db: input.db, registry, transportFactory: normalTransport, agents, runId })

  // Routing telemetry is measured from the real deployed Agent Card endpoints. These deterministic
  // reference specialists invoke no external model/provider, so provider cost score is exactly zero.
  const measurements = await Promise.all(agents.map(agent => measureAgentCard(agent, runId)))
  const observedAt = new Date()
  await persistTelemetry(input.db, measurements, runId, observedAt)

  const productionAdapters = createSupabaseSpecialistMeshProductionAdapters(input.db)
  const agentIds = agents.map(agent => agent.agentId)
  const qualifications = await productionAdapters.qualifications.snapshot({
    tenantId: TENANT_ID, environmentId: ENVIRONMENT_ID, portableId: PORTABLE_ID, skillId: SKILL_ID, agentIds,
  })
  if (agentIds.some(agentId => qualifications[agentId]?.qualified !== true || !String(qualifications[agentId]?.evidenceRef ?? '').trim())) {
    throw new Error('specialist_mesh_production_acceptance_exact_two_qualifications_missing')
  }
  if (qualifications[agentIds[0]!]!.evidenceRef === qualifications[agentIds[1]!]!.evidenceRef) {
    throw new Error('specialist_mesh_production_acceptance_independent_qualification_evidence_required')
  }

  const signals = await productionAdapters.meshSignals.snapshot({
    tenantId: TENANT_ID, environmentId: ENVIRONMENT_ID, portableId: PORTABLE_ID, skillId: SKILL_ID, agentIds,
  })
  const ranked = rankSpecialistMeshCandidates(agentIds.map(agentId => ({ agentId })), signals)
  if (ranked.length !== 2) throw new Error(`specialist_mesh_production_acceptance_exact_two_routable_required:${ranked.length}`)
  const primaryAgentId = ranked[0]!.agentId
  const fallbackAgentId = ranked[1]!.agentId

  const failureToken = createSpecialistMeshAcceptanceFailureToken({
    agentId: primaryAgentId,
    signingSecret: failureControlSecret,
    ttlMs: 120_000,
  })
  const failoverTransport = createA2AHttpJsonRpcTransportFactory({
    connectionResolver: endpointResolver(agents, { agentId: primaryAgentId, token: failureToken }),
  })
  const observer = createInMemoryA2ARuntimeObserver()
  const coordinationStore = createSupervisorCoordinationStore({ supabase: input.db, runtime: 'production' })
  const host = createPortableA2AHost({
    registry,
    transportFactory: failoverTransport,
    qualifications: productionAdapters.qualifications,
    meshSignals: productionAdapters.meshSignals,
    observe: observer,
    meshCoordination: {
      store: coordinationStore,
      environment: 'production',
      policyVersion: SPECIALIST_MESH_PRODUCTION_LIVE_ACCEPTANCE_VERSION,
      softwareVersion: productionCommit,
    },
    timeoutMs: 10_000,
  })

  const result = await host.orchestrator.orchestrate({
    tenantId: TENANT_ID,
    environmentId: ENVIRONMENT_ID,
    portableId: PORTABLE_ID,
    messageId,
    text: FAILOVER_MESSAGE,
    traceId,
    plan: { familyId: FAMILY_ID, skillId: SKILL_ID },
  })
  if (!result.ok || result.mode !== 'delegated' || result.routingMode !== 'automatic_mesh') {
    throw new Error(`specialist_mesh_production_acceptance_failover_failed:${result.mode ?? 'unknown'}`)
  }
  if (result.selectedAgentId !== fallbackAgentId) throw new Error('specialist_mesh_production_acceptance_wrong_fallback')
  if (!result.meshAttemptedAgentIds || result.meshAttemptedAgentIds.length !== 2 || result.meshAttemptedAgentIds[0] !== primaryAgentId || result.meshAttemptedAgentIds[1] !== fallbackAgentId) {
    throw new Error('specialist_mesh_production_acceptance_attempt_order_mismatch')
  }

  const observations = observer.snapshot().filter(event => event.traceId === traceId && event.skillId === SKILL_ID)
  if (observations.length !== 2) throw new Error(`specialist_mesh_production_acceptance_observation_count:${observations.length}`)
  const primaryObservation = observations.find(event => event.agentId === primaryAgentId)
  const fallbackObservation = observations.find(event => event.agentId === fallbackAgentId)
  if (!primaryObservation || primaryObservation.ok || primaryObservation.mode !== 'a2a_transport_unavailable' || primaryObservation.executionAttempted !== true) {
    throw new Error('specialist_mesh_production_acceptance_primary_failure_evidence_missing')
  }
  if (!fallbackObservation || !fallbackObservation.ok || fallbackObservation.mode !== 'delegated' || fallbackObservation.executionAttempted !== true) {
    throw new Error('specialist_mesh_production_acceptance_fallback_success_evidence_missing')
  }

  const meshTaskId = [TENANT_ID, ENVIRONMENT_ID, PORTABLE_ID, `message:${messageId}`].join(':')
  const workItemId = `specialist-mesh:${meshTaskId}`
  const { data: leaseRows, error: leaseError } = await input.db.from('supervisor_leases')
    .select('lease_id,work_item_id,owner_instance_id,owner_runtime_id,fencing_token,status,released_at,acquired_at')
    .eq('work_item_id', workItemId)
    .order('fencing_token', { ascending: true })
  if (leaseError) throw leaseError
  if (!Array.isArray(leaseRows) || leaseRows.length !== 2) throw new Error(`specialist_mesh_production_acceptance_lease_count:${leaseRows?.length ?? 0}`)
  const firstLease = leaseRows[0]!
  const secondLease = leaseRows[1]!
  if (Number(secondLease.fencing_token) <= Number(firstLease.fencing_token)) throw new Error('specialist_mesh_production_acceptance_fence_not_advanced')

  let staleOwnerRejected = false
  try {
    await coordinationStore.assertFence(workItemId, leaseIdentity(firstLease), new Date())
  } catch (error: any) {
    staleOwnerRejected = error?.code === 'stale_owner_rejected' || /stale/i.test(String(error?.message ?? ''))
    if (!staleOwnerRejected) throw error
  }
  if (!staleOwnerRejected) throw new Error('specialist_mesh_production_acceptance_stale_owner_not_rejected')

  const finalWork = await coordinationStore.getWorkItem(workItemId)
  if (!finalWork || finalWork.state !== 'completed') throw new Error(`specialist_mesh_production_acceptance_final_state:${finalWork?.state ?? 'missing'}`)

  const { data: transitionRows, error: transitionError } = await input.db.from('supervisor_coordination_events')
    .select('event_type,occurred_at,payload')
    .eq('event_type', 'work_item_transitioned')
    .gte('occurred_at', startedAt.toISOString())
  if (transitionError) throw transitionError
  const transitions = (transitionRows ?? []).filter((row: any) => row?.payload?.workItemId === workItemId)
  const verificationTransitions = transitions.filter((row: any) => row?.payload?.to === 'verification_pending').length
  const completionTransitions = transitions.filter((row: any) => row?.payload?.to === 'completed').length
  if (verificationTransitions !== 1 || completionTransitions !== 1) {
    throw new Error(`specialist_mesh_production_acceptance_completion_evidence:${verificationTransitions}:${completionTransitions}`)
  }

  const measurementByAgent = new Map(measurements.map(item => [item.agentId, item] as const))
  const qualificationFingerprint = (agentId: string) => `sha256:${createHash('sha256').update(String(qualifications[agentId]!.evidenceRef), 'utf8').digest('hex')}`
  const acceptedAt = new Date().toISOString()
  const evidence = Object.freeze({
    schemaVersion: SPECIALIST_MESH_PRODUCTION_LIVE_ACCEPTANCE_VERSION,
    acceptanceClass: 'signalboost-production-live',
    buyerAccepted: false,
    runId,
    acceptedAt,
    productionCommit,
    scope: { tenantId: TENANT_ID, environmentId: ENVIRONMENT_ID, portableId: PORTABLE_ID, familyId: FAMILY_ID, skillId: SKILL_ID },
    routing: {
      mode: 'automatic_mesh',
      primaryAgentId,
      fallbackAgentId,
      primaryMeshScore: ranked[0]!.meshScore,
      fallbackMeshScore: ranked[1]!.meshScore,
      primaryTelemetry: measurementByAgent.get(primaryAgentId),
      fallbackTelemetry: measurementByAgent.get(fallbackAgentId),
    },
    qualification: {
      primaryEvidenceFingerprint: qualificationFingerprint(primaryAgentId),
      fallbackEvidenceFingerprint: qualificationFingerprint(fallbackAgentId),
      verifierId: VERIFIER_ID,
      independentlyQualified: true,
    },
    failover: {
      controlledRecoverableUnavailability: true,
      attemptedAgentIds: [primaryAgentId, fallbackAgentId],
      primaryMode: primaryObservation.mode,
      fallbackMode: fallbackObservation.mode,
      primaryObservationEventId: primaryObservation.eventId,
      fallbackObservationEventId: fallbackObservation.eventId,
      primaryDurationMs: primaryObservation.durationMs,
      fallbackDurationMs: fallbackObservation.durationMs,
      noBroadcastObserved: true,
    },
    ownership: {
      workItemId,
      firstFencingToken: Number(firstLease.fencing_token),
      secondFencingToken: Number(secondLease.fencing_token),
      staleFirstOwnerRejected: true,
      verificationTransitions,
      completionTransitions,
      finalState: finalWork.state,
    },
    security: {
      advisoryOnly: true,
      authorityWidened: false,
      automaticWriteReplayEnabled: false,
      callerSuppliedQualification: false,
      callerSuppliedTelemetry: false,
    },
  })

  const eventId = `specialist-mesh-production-live-${runId}`
  const { error: auditError } = await input.db.from('supervisor_audit_events').insert({
    event_id: eventId,
    execution_id: traceId,
    incident_id: workItemId,
    event_type: SPECIALIST_MESH_PRODUCTION_ACCEPTANCE_EVENT,
    occurred_at: acceptedAt,
    payload: evidence,
    schema_version: SPECIALIST_MESH_PRODUCTION_LIVE_ACCEPTANCE_VERSION,
  })
  if (auditError) throw auditError

  return Object.freeze({ eventId, evidence })
}
