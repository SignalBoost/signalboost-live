// Live Builder Residency case runner.
//
// The exact student artifact chooses actions. Fresh fixture setup is host-owned. Every student tool
// action (workspace reads/writes and sandbox execution) crosses Platform Harness -> Governed Socket.
// There is no Production repository mutation, merge, deploy, database write, or hidden final exam.

import { createHash } from 'node:crypto'
import { BuilderToolLoop } from '@/lib/builder/tool-loop'
import { createGovernedBuilderAiPort } from '@/lib/builder/control-adapter'
import type {
  BuilderFile,
  BuilderLoopResult,
  BuilderRunnerPort,
  BuilderWorkspacePort,
} from '@/lib/builder/contracts'
import { InMemoryBuilderWorkspace } from '@/lib/builder/workspace'
import { VercelSandboxBuilderRunner } from '@/lib/builder/vercel-sandbox-runner'
import type {
  AgentRequest,
  GatewayHost,
  GovernancePolicy,
} from '@/agent-gateway/types'
import {
  createPortableCapabilityDescriptor,
  type PortableCapabilityDiscoveryPort,
} from '@/provider-hub-core/capability-runtime'
import {
  createGovernedHarnessExecutor,
  createProviderHubHarnessCapabilityResolver,
  resolveHarnessManifest,
  runHarnessWorker,
  type HarnessAuthorityEnvelope,
  type HarnessCapabilityGrant,
  type HarnessRunResult,
  type HarnessWorkerContext,
} from '@/platform-harness'
import {
  materializeBuilderResidencyTeachingCase,
  verifyBuilderResidencyTeachingCase,
  type BuilderResidencyTeachingCaseId,
} from './builder-residency-teaching'
import {
  createResidencyArtifactBuilderAiPort,
  provisionResidencyArtifactRuntime,
  type ResidencyArtifactRuntimeLease,
} from '@/lib/ai/cos/cosUniversityResidencyRuntime'

export const BUILDER_RESIDENCY_LIVE_RUNNER_VERSION =
  'builder-residency-live-runner-v1' as const

const CAPABILITIES = Object.freeze([
  { id: 'native.builder.workspace.list', environments: ['sandbox'] as const, mutating: false, risk: 'read' as const, scopes: ['builder.workspace.read'] },
  { id: 'native.builder.workspace.read', environments: ['sandbox'] as const, mutating: false, risk: 'read' as const, scopes: ['builder.workspace.read'] },
  { id: 'native.builder.workspace.write', environments: ['sandbox'] as const, mutating: true, risk: 'write' as const, scopes: ['builder.workspace.write'] },
  { id: 'native.builder.workspace.edit', environments: ['sandbox'] as const, mutating: true, risk: 'write' as const, scopes: ['builder.workspace.write'] },
  { id: 'native.builder.sandbox.run', environments: ['sandbox'] as const, mutating: true, risk: 'write' as const, scopes: ['builder.sandbox.execute'] },
] satisfies readonly HarnessCapabilityGrant[])

const sha256 = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')

function params(request: AgentRequest): Record<string, unknown> {
  return request.action.params && typeof request.action.params === 'object'
    ? request.action.params
    : {}
}

function cleanString(value: unknown, max = 4000): string {
  return String(value ?? '').trim().slice(0, max)
}

function exactWorkspace(value: unknown, workspaceId: string): string {
  const normalized = cleanString(value, 240)
  if (normalized !== workspaceId) throw new Error('builder_residency_workspace_scope_mismatch')
  return normalized
}

function createNativeDiscovery(input: {
  tenantId: string
  environmentId: string
}): PortableCapabilityDiscoveryPort {
  const descriptors = CAPABILITIES.map(grant => createPortableCapabilityDescriptor({
    capabilityId: grant.id,
    providerId: 'itmounts-builder-sandbox-native',
    connectionId: `builder-residency:${input.environmentId}`,
    tenantId: input.tenantId,
    environmentId: input.environmentId,
    risk: grant.risk,
    availability: 'available',
    requiresApproval: false,
    scopes: grant.scopes,
    metadata: {
      profile: 'residency',
      production: false,
      ephemeral: true,
    },
  }))

  return Object.freeze({
    async discover(query) {
      if (
        query.tenantId !== input.tenantId
        || query.environmentId !== input.environmentId
      ) return Object.freeze([])
      return Object.freeze(descriptors)
    },
  })
}

function createNativeGovernance(input: {
  workspaceId: string
  workspace: InMemoryBuilderWorkspace
  runner: VercelSandboxBuilderRunner
}): {
  policy: GovernancePolicy
  host: GatewayHost
} {
  const allowed = new Set(CAPABILITIES.map(item => item.id))

  const policy: GovernancePolicy = {
    classifier: {
      classify(request) {
        const harness = params(request)._harness
        const environmentClass =
          harness && typeof harness === 'object' && !Array.isArray(harness)
            ? String((harness as Record<string, unknown>).environmentClass ?? '')
            : ''
        if (!allowed.has(request.action.target) || environmentClass !== 'sandbox') return 'unknown'
        return 'reversible_internal'
      },
    },
    allowlist: [
      { actionKind: 'read', target: 'native.builder.workspace.list', rollback: 'no-op' },
      { actionKind: 'read', target: 'native.builder.workspace.read', rollback: 'no-op' },
      { actionKind: 'write', target: 'native.builder.workspace.write', rollback: 'discard ephemeral residency workspace' },
      { actionKind: 'write', target: 'native.builder.workspace.edit', rollback: 'discard ephemeral residency workspace' },
      { actionKind: 'run', target: 'native.builder.sandbox.run', rollback: 'destroy ephemeral Vercel sandbox' },
    ],
  }

  const host: GatewayHost = {
    execution: {
      async perform(request) {
        try {
          const p = params(request)
          const workspaceId = exactWorkspace(p.workspaceId, input.workspaceId)

          if (request.action.target === 'native.builder.workspace.list') {
            return { ok: true, result: await input.workspace.listFiles(workspaceId) }
          }
          if (request.action.target === 'native.builder.workspace.read') {
            return {
              ok: true,
              result: await input.workspace.readFile(
                workspaceId,
                cleanString(p.path, 240),
              ),
            }
          }
          if (request.action.target === 'native.builder.workspace.write') {
            return {
              ok: true,
              result: await input.workspace.writeFile(
                workspaceId,
                cleanString(p.path, 240),
                String(p.content ?? ''),
              ),
            }
          }
          if (request.action.target === 'native.builder.workspace.edit') {
            return {
              ok: true,
              result: await input.workspace.editFile(
                workspaceId,
                cleanString(p.path, 240),
                String(p.search ?? ''),
                String(p.replace ?? ''),
              ),
            }
          }
          if (request.action.target === 'native.builder.sandbox.run') {
            const listed = await input.workspace.listFiles(workspaceId)
            const files: BuilderFile[] = []
            for (const item of listed) {
              const file = await input.workspace.readFile(workspaceId, item.path)
              if (file) files.push(file)
            }
            return {
              ok: true,
              result: await input.runner.run({
                workspaceId,
                command: cleanString(p.command, 2000),
                files,
              }),
            }
          }

          return { ok: false, error: 'builder_residency_native_target_unknown' }
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error
              ? cleanString(error.message, 500)
              : 'builder_residency_native_execution_failed',
          }
        }
      },
    },
  }

  return { policy, host }
}

function createGovernedBuilderPorts(
  context: HarnessWorkerContext,
  workspaceId: string,
): { workspace: BuilderWorkspacePort; runner: BuilderRunnerPort } {
  let sequence = 0

  const execute = async <T>(
    kind: 'read' | 'write' | 'run',
    capabilityId: string,
    input: Record<string, unknown>,
  ): Promise<T> => {
    sequence += 1
    const result = await context.execute({
      actionId: `builder-${sequence}`,
      kind,
      capabilityId,
      params: { workspaceId, ...input },
    })
    if (result.status !== 'executed' || result.gatewayOutcome?.ok !== true) {
      throw new Error(
        result.error
        || `builder_residency_governed_action_${result.status}`,
      )
    }
    return result.gatewayOutcome.result as T
  }

  const workspace: BuilderWorkspacePort = Object.freeze({
    listFiles: async id => execute(
      'read',
      'native.builder.workspace.list',
      { workspaceId: exactWorkspace(id, workspaceId) },
    ),
    readFile: async (id, path) => execute(
      'read',
      'native.builder.workspace.read',
      { workspaceId: exactWorkspace(id, workspaceId), path },
    ),
    writeFile: async (id, path, content) => execute(
      'write',
      'native.builder.workspace.write',
      { workspaceId: exactWorkspace(id, workspaceId), path, content },
    ),
    editFile: async (id, path, search, replace) => execute(
      'write',
      'native.builder.workspace.edit',
      { workspaceId: exactWorkspace(id, workspaceId), path, search, replace },
    ),
  })

  const runner: BuilderRunnerPort = Object.freeze({
    run: async input => execute(
      'run',
      'native.builder.sandbox.run',
      {
        workspaceId: exactWorkspace(input.workspaceId, workspaceId),
        command: input.command,
      },
    ),
  })

  return { workspace, runner }
}

function workerFailureAttribution(error: string): 'infrastructure' | 'harness' {
  return /sandbox|vercel|runpod|network|transport|provider|unavailable/i.test(error)
    ? 'infrastructure'
    : 'harness'
}

export type BuilderResidencyLiveExecution = Readonly<{
  lease: ResidencyArtifactRuntimeLease
  harnessResult: HarnessRunResult
  builderResult: BuilderLoopResult | null
  verifierEvidenceHash: string | null
  trajectoryEvidenceHash: string
  variantHash: string
  caseFamily: string
  competencyId: string
}>

export async function executeBuilderResidencyTeachingCase(input: {
  caseRunId: string
  harnessRunId: string
  caseId: BuilderResidencyTeachingCaseId
  expectedVariantHash: string
  candidateId: string
  subjectId: string
  artifactId: string
  artifactRevision: string
  artifactHash: string
}): Promise<BuilderResidencyLiveExecution> {
  const teachingCase = materializeBuilderResidencyTeachingCase(
    input.caseId,
    input.candidateId,
  )
  if (teachingCase.variantHash !== input.expectedVariantHash) {
    throw new Error('builder_residency_variant_identity_mismatch')
  }
  if (teachingCase.finalExamMaterialUsed) {
    throw new Error('builder_residency_final_exam_material_forbidden')
  }

  const lease = await provisionResidencyArtifactRuntime({
    caseRunId: input.caseRunId,
    candidateId: input.candidateId,
    subjectId: input.subjectId,
    artifactId: input.artifactId,
    artifactRevision: input.artifactRevision,
    artifactHash: input.artifactHash,
  })

  const tenantId = 'itmounts-university'
  const environmentId = `builder-residency-${input.caseRunId}`
  const workspaceId = input.caseRunId
  const request = {
    runId: input.harnessRunId,
    objective: teachingCase.objective,
    identity: {
      agentId: `builder-resident:${input.candidateId}`,
      role: 'builder',
      tenantId,
      portableId: 'builder-residency',
      artifact: {
        artifactId: input.artifactId,
        artifactHash: input.artifactHash,
        revision: input.artifactRevision,
      },
    },
    profile: 'residency' as const,
    environment: {
      environmentId,
      class: 'sandbox' as const,
      fixtureHash: teachingCase.variantHash,
    },
    requestedCapabilities: CAPABILITIES.map(item => item.id),
    requestedLimits: {
      maxToolCalls: 90,
      deadlineMs: 260_000,
      maxConcurrency: 1,
    },
  }

  const authority: HarnessAuthorityEnvelope = Object.freeze({
    manifestRef: `host://university/residency/${input.caseRunId}`,
    verified: true,
    verifiedBy: 'host',
    environments: Object.freeze(['sandbox'] as const),
    capabilities: CAPABILITIES,
    limits: Object.freeze({
      maxToolCalls: 90,
      deadlineMs: 260_000,
      maxConcurrency: 1,
    }),
  })

  const policy = resolveHarnessManifest(request, authority)
  if (!policy.allowed) {
    throw new Error(`builder_residency_manifest_rejected:${policy.reasons.join(',')}`)
  }

  const rawWorkspace = new InMemoryBuilderWorkspace()
  for (const file of teachingCase.seed) {
    await rawWorkspace.writeFile(workspaceId, file.path, file.content)
  }
  const rawRunner = new VercelSandboxBuilderRunner()
  const native = createNativeGovernance({
    workspaceId,
    workspace: rawWorkspace,
    runner: rawRunner,
  })
  const executor = createGovernedHarnessExecutor(native)
  const capabilities = createProviderHubHarnessCapabilityResolver(
    createNativeDiscovery({ tenantId, environmentId }),
  )

  const deadlineAtMs = Date.now() + 245_000
  const ai = createGovernedBuilderAiPort(
    createResidencyArtifactBuilderAiPort(lease),
    { deadlineAtMs },
  )

  let builderResult: BuilderLoopResult | null = null
  let workerError: string | null = null
  let verifierEvidenceHash: string | null = null

  const harnessResult = await runHarnessWorker({
    manifest: policy.manifest,
    capabilities,
    executor,
    worker: {
      async run(context) {
        const governed = createGovernedBuilderPorts(context, workspaceId)
        try {
          builderResult = await new BuilderToolLoop(
            ai,
            governed.workspace,
            governed.runner,
          ).run({
            objective: teachingCase.objective,
            workspaceId,
            maxRounds: 32,
            deadlineAtMs,
            modelRoundTimeoutMs: 60_000,
          })
        } catch (error) {
          workerError = error instanceof Error
            ? cleanString(error.message, 500)
            : 'builder_residency_worker_failed'
        }

        context.observe({
          summary: builderResult
            ? 'Builder Residency teaching case completed; independent host verification follows.'
            : 'Builder Residency teaching case did not reach a normal Builder result.',
          evidenceRefs: [
            `sha256:${lease.runtimeIdentityEvidenceHash}`,
          ],
          data: {
            caseId: teachingCase.id,
            caseFamily: teachingCase.caseFamily,
            competencyId: teachingCase.competencyId,
            variantHash: teachingCase.variantHash,
            builderResultOk: builderResult?.ok ?? false,
            workerError: workerError ? 'present' : 'none',
            finalExamMaterialUsed: false,
          },
        })
      },
    },
    verifier: {
      async verify() {
        if (workerError || !builderResult) {
          return {
            verified: false,
            verifierRef: 'host://university/residency/builder-teaching-v1',
            evidenceRefs: [
              `sha256:${lease.runtimeIdentityEvidenceHash}`,
            ],
            reason: workerError || 'builder_residency_result_missing',
            failureAttribution: workerFailureAttribution(
              workerError || 'builder_residency_result_missing',
            ),
          }
        }

        const verified = verifyBuilderResidencyTeachingCase(
          teachingCase,
          builderResult,
        )
        verifierEvidenceHash = verified.evidenceHash

        return {
          verified: verified.passed,
          verifierRef: 'host://university/residency/builder-teaching-v1',
          evidenceRefs: [
            `sha256:${lease.runtimeIdentityEvidenceHash}`,
            `sha256:${verified.evidenceHash}`,
          ],
          ...(verified.passed
            ? {}
            : {
                reason: verified.reasons.join(',') || 'builder_residency_case_failed',
                failureAttribution: 'competency' as const,
              }),
        }
      },
    },
  })

  const trajectoryEvidenceHash = sha256({
    profile: BUILDER_RESIDENCY_LIVE_RUNNER_VERSION,
    runId: harnessResult.runId,
    artifactHash: input.artifactHash,
    variantHash: teachingCase.variantHash,
    trajectory: harnessResult.trajectory,
  })

  return Object.freeze({
    lease,
    harnessResult,
    builderResult,
    verifierEvidenceHash,
    trajectoryEvidenceHash,
    variantHash: teachingCase.variantHash,
    caseFamily: teachingCase.caseFamily,
    competencyId: teachingCase.competencyId,
  })
}
