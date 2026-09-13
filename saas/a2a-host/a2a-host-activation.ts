import type { SupabaseClient } from '@supabase/supabase-js'
import { A2A_AGENT_REGISTRY_VERSION, type A2AAgentRegistryPort, type A2ATransportFactory } from './a2a-agent-registry.ts'
import { installCOSA2AQualificationAssessmentPort, installCOSA2ARuntimeHost } from './cos-runtime-host.ts'
import { createCOSSpecialistOrchestrator } from './cos-specialist-orchestrator.ts'
import { createPortableA2AHost, type PortableA2AHost, type PortableA2AHostOptions } from './portable-a2a-host.ts'
import { createSupabaseSpecialistMeshProductionAdapters } from './specialist-mesh-production-adapters.ts'
import { createSupabaseSpecialistMeshCheckpointStore } from './specialist-mesh-checkpoint.ts'
import { createDurableSpecialistMeshDelegationPort } from './specialist-mesh-execution-ownership.ts'
import {
  createSupabaseSpecialistMeshWriteRecoveryStore,
  type SpecialistMeshWriteRecoveryProviderRegistry,
} from './specialist-mesh-write-recovery.ts'
import { createSupervisorCoordinationStore } from '../lib/supervisor/coordination/durable-coordination-store.ts'
import {
  createSpecialistQualificationAssessmentPort,
  type SpecialistQualificationProbeProvider,
  type SpecialistQualificationVerifier,
} from './specialist-qualification-assessment.ts'

export const A2A_HOST_ACTIVATION_VERSION = 'signalboost-a2a-host-activation-v7' as const

export interface A2AHostActivationSummary {
  version: typeof A2A_HOST_ACTIVATION_VERSION
  activatedAt: string
  enabledAgentCount: number
  enabledAssignmentCount: number
  transportRefs: readonly string[]
}

export interface ProductionSpecialistQualificationAssessmentOptions {
  probes: SpecialistQualificationProbeProvider
  verifier: SpecialistQualificationVerifier
  validForMs?: number
}

function required(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`A2A host activation ${name} is required`)
  if (normalized === '*') throw new Error(`A2A host activation ${name} does not allow wildcard scope`)
  return normalized
}

function productionMeshCoordination(
  db: SupabaseClient,
  writeRecoveryProviders?: SpecialistMeshWriteRecoveryProviderRegistry,
) {
  return Object.freeze({
    store: createSupervisorCoordinationStore({ supabase: db, runtime: 'production' }),
    checkpoints: createSupabaseSpecialistMeshCheckpointStore(db),
    ...(writeRecoveryProviders ? {
      writeRecovery: Object.freeze({
        providers: writeRecoveryProviders,
        store: createSupabaseSpecialistMeshWriteRecoveryStore(db),
      }),
    } : {}),
    environment: 'production' as const,
    policyVersion: A2A_HOST_ACTIVATION_VERSION,
    softwareVersion: A2A_HOST_ACTIVATION_VERSION,
  })
}

export async function validateA2AHostActivation(registry: A2AAgentRegistryPort, now: () => Date = () => new Date()): Promise<A2AHostActivationSummary> {
  const snapshot = await registry.snapshot()
  if (snapshot.schemaVersion !== A2A_AGENT_REGISTRY_VERSION) throw new Error('a2a_registry_schema_version_mismatch')

  const enabledAgents = snapshot.agents.filter(agent => agent.enabled)
  if (enabledAgents.length === 0) throw new Error('a2a_activation_no_enabled_agents')
  const enabledAgentIds = new Set(enabledAgents.map(agent => agent.agentId))
  const enabledAssignments = snapshot.assignments.filter(assignment => assignment.enabled && enabledAgentIds.has(assignment.agentId))
  if (enabledAssignments.length === 0) throw new Error('a2a_activation_no_enabled_assignments')

  for (const assignment of enabledAssignments) {
    required(assignment.tenantId, 'tenantId')
    required(assignment.environmentId, 'environmentId')
    required(assignment.portableId, 'portableId')
  }

  const transportRefs = [...new Set(enabledAgents.map(agent => required(agent.transportRef, 'transportRef')))].sort()
  return Object.freeze({
    version: A2A_HOST_ACTIVATION_VERSION,
    activatedAt: now().toISOString(),
    enabledAgentCount: enabledAgents.length,
    enabledAssignmentCount: enabledAssignments.length,
    transportRefs: Object.freeze(transportRefs),
  })
}

export async function activatePortableA2AHost(options: PortableA2AHostOptions & { now?: () => Date }) {
  const summary = await validateA2AHostActivation(options.registry, options.now)
  const host = createPortableA2AHost(options)
  return Object.freeze({ host, summary })
}

export async function activateCOSA2AHost(options: PortableA2AHostOptions & { now?: () => Date }) {
  const activated = await activatePortableA2AHost(options)
  const dispose = installCOSA2ARuntimeHost(activated.host)
  return Object.freeze({ ...activated, dispose })
}

/**
 * Production composition root for a fully constructed host. Durable specialist qualification,
 * routing telemetry, execution ownership, bounded advisory checkpoints, and optional provider-specific
 * write recovery replace caller-supplied mesh evidence/coordination. Provider adapters are buyer/host
 * controlled; absent an exact adapter, automatic non-advisory takeover remains disabled.
 */
export async function activateProductionCOSA2AHost(options: Omit<PortableA2AHostOptions, 'qualifications' | 'meshSignals' | 'meshCoordination'> & {
  db: SupabaseClient
  qualificationAssessment: ProductionSpecialistQualificationAssessmentOptions
  writeRecoveryProviders?: SpecialistMeshWriteRecoveryProviderRegistry
  now?: () => Date
}) {
  const { db, qualificationAssessment, writeRecoveryProviders, ...hostOptions } = options
  const mesh = createSupabaseSpecialistMeshProductionAdapters(db, { now: options.now })
  const activated = await activateCOSA2AHost({
    ...hostOptions,
    qualifications: mesh.qualifications,
    meshSignals: mesh.meshSignals,
    meshCoordination: productionMeshCoordination(db, writeRecoveryProviders),
  })
  const assessmentPort = createSpecialistQualificationAssessmentPort({
    registry: hostOptions.registry,
    transportFactory: hostOptions.transportFactory,
    probes: qualificationAssessment.probes,
    verifier: qualificationAssessment.verifier,
    timeoutMs: hostOptions.timeoutMs,
    validForMs: qualificationAssessment.validForMs,
    now: hostOptions.now,
  })
  const disposeAssessment = installCOSA2AQualificationAssessmentPort(assessmentPort)
  const dispose = () => {
    disposeAssessment()
    activated.dispose()
  }
  return Object.freeze({ ...activated, assessmentPort, dispose })
}

/**
 * Deployed-route composition for an already installed governed host. This preserves its registry,
 * transport runtime, audit boundaries, and authorization while replacing qualification/routing
 * evidence and adding durable fenced execution ownership, bounded advisory checkpoint/resume, and
 * optional provider-reconciled write recovery. No host is fabricated on a cold start.
 */
export function attachProductionSpecialistMeshEvidence(
  host: PortableA2AHost,
  db: SupabaseClient,
  options: { now?: () => Date; writeRecoveryProviders?: SpecialistMeshWriteRecoveryProviderRegistry } = {},
): PortableA2AHost {
  const mesh = createSupabaseSpecialistMeshProductionAdapters(db, { now: options.now })
  const specialistDelegation = createDurableSpecialistMeshDelegationPort({
    registry: host.registry,
    delegation: host.delegation,
    coordination: productionMeshCoordination(db, options.writeRecoveryProviders),
  })
  const orchestrator = createCOSSpecialistOrchestrator({
    registry: host.registry,
    delegation: specialistDelegation,
    qualifications: mesh.qualifications,
    meshSignals: mesh.meshSignals,
  })
  return Object.freeze({ ...host, orchestrator })
}

export type A2AHostActivationOptions = {
  registry: A2AAgentRegistryPort
  transportFactory: A2ATransportFactory
} & Omit<PortableA2AHostOptions, 'registry' | 'transportFactory'>
