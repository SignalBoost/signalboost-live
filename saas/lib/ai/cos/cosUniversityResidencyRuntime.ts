// Exact student-artifact serving seam for University Residency.
//
// A Residency runtime lease is supervised educational infrastructure. Creating/proving this lease
// MUST NOT be recorded as a final canary, final evaluation, graduation, or Production activation.

import { createHash } from 'node:crypto'
import { callLocalModel, type LocalInferenceConfig } from '@/lib/ai/local-inference'
import type { BuilderAiPort } from '@/lib/builder/contracts'
import { configuredRunpodApiKey } from './runpodConfig'
import { provisionMassDistilledRuntime } from './runpodMassDistilledProvision'
import { proveGraduateServedIdentity } from './cosUniversityGraduateRuntime'

export const COS_UNIVERSITY_RESIDENCY_RUNTIME_VERSION =
  'cos-university-residency-runtime-v1' as const

export type ResidencyArtifactRuntimeLease = Readonly<{
  candidateId: string
  artifactId: string
  artifactRevision: string
  artifactHash: string
  endpointId: string
  modelName: string
  baseUrl: string
  runtimeIdentityEvidenceHash: string
  inference: LocalInferenceConfig
  semantics: 'supervised_practical_residency_runtime_not_final_canary'
}>

const sha256 = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')

export async function provisionResidencyArtifactRuntime(input: {
  caseRunId: string
  candidateId: string
  subjectId: string
  artifactId: string
  artifactRevision: string
  artifactHash: string
}): Promise<ResidencyArtifactRuntimeLease> {
  const runtimeKey = sha256({
    purpose: 'practical_residency',
    caseRunId: input.caseRunId,
    candidateId: input.candidateId,
    artifactHash: input.artifactHash,
  }).slice(0, 10)

  const runtime = await provisionMassDistilledRuntime({
    candidateId: input.candidateId,
    subjectId: input.subjectId,
    artifactId: input.artifactId,
    artifactRevision: input.artifactRevision,
    artifactHash: input.artifactHash,
    runtimeKey,
  })

  const apiKey = configuredRunpodApiKey()
  if (!apiKey) throw new Error('residency_runpod_api_key_missing')

  const inference: LocalInferenceConfig = Object.freeze({
    baseUrl: runtime.baseUrl,
    model: runtime.modelName,
    apiKey,
    timeoutMs: 70_000,
    provider: 'runpod',
    routeOwner: 'itmounts',
  })

  const identity = await proveGraduateServedIdentity(
    inference,
    runtime.modelName,
    { waitMs: 260_000 },
  )
  if (!identity.ok || identity.model !== runtime.modelName) {
    throw new Error(`residency_exact_artifact_runtime_not_ready:${identity.error || 'model_not_served'}`)
  }

  const runtimeIdentityEvidenceHash = sha256({
    profile: COS_UNIVERSITY_RESIDENCY_RUNTIME_VERSION,
    semantics: 'supervised_practical_residency_runtime_not_final_canary',
    caseRunId: input.caseRunId,
    candidateId: input.candidateId,
    artifactId: input.artifactId,
    artifactRevision: input.artifactRevision,
    artifactHash: input.artifactHash,
    endpointId: runtime.endpointId,
    modelName: runtime.modelName,
    servedIdentity: identity.model,
    proofVia: identity.via,
    proofAttempts: identity.attempts,
    workersMin: runtime.workersMin,
    workersMax: runtime.workersMax,
    idleTimeout: runtime.idleTimeout,
  })

  return Object.freeze({
    candidateId: input.candidateId,
    artifactId: input.artifactId,
    artifactRevision: input.artifactRevision,
    artifactHash: input.artifactHash,
    endpointId: runtime.endpointId,
    modelName: runtime.modelName,
    baseUrl: runtime.baseUrl,
    runtimeIdentityEvidenceHash,
    inference,
    semantics: 'supervised_practical_residency_runtime_not_final_canary',
  })
}

export function createResidencyArtifactBuilderAiPort(
  lease: ResidencyArtifactRuntimeLease,
): BuilderAiPort {
  return Object.freeze({
    async generate(input) {
      const text = await callLocalModel({
        prompt: input.prompt,
        systemPrompt: input.systemPrompt,
        maxTokens: input.maxTokens,
        frequencyPenalty: 0,
        presencePenalty: 0,
        jsonObject: true,
        disableThinking: true,
        allowConfiguredFallback: false,
        timeoutMs: 60_000,
        usageContext: {
          feature: 'builder_residency_student',
          purpose: `practical_residency:${lease.candidateId}`,
        },
      }, lease.inference)

      if (!text?.trim()) throw new Error('residency_exact_artifact_inference_empty')
      return text
    },
  })
}
