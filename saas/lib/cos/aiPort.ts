import { randomUUID } from 'node:crypto'
// saas/lib/cos/aiPort.ts
// Injected model-access seam for COS generators. Text requests enter the shared COS gateway so
// existing Portables gain durable reuse and single-flight protection without owning provider logic.
import { callLocalModel, localInferenceConfigFromEnv } from '@/lib/ai/local-inference'
import { callProviderModel, type ModelProvider } from '@/lib/ai/providerRouter'
import { callCosText } from '@/lib/cos/textGateway'
import { requireBuilderCodingModel } from '@/lib/ai/cos/platformIdentityContext'
import { activeGraduateRuntimesForRole } from '@/lib/ai/cos/cosUniversityGraduateRuntime'
import { currentReasoningEvaluationContext } from '@/lib/ai/cos/reasoningEvaluationContext'
import { tryRunpodPrimaryInference } from '@/lib/ai/cos/runpodPrimaryInference'
import { freshVisualPrompt } from '@/lib/visuals/freshGeneration'
import { withProductionRuntimeHarness } from '../../platform-harness/adapters/production.ts'
import { currentHarnessExecutionContext } from '../../platform-harness/runtime/execution-context.ts'

export interface CosAiPort {
  generate(input: { prompt: string; systemPrompt?: string; maxTokens?: number; modelPreference?: ModelProvider }): Promise<string>
}

export type ExternalTeacherProvider = Exclude<ModelProvider, 'local'>

type HarnessAiPortIdentity = Readonly<{
  agentId: string
  role: string
  objective: string
  portableId?: string
  deadlineMs?: number
}>

function harnessAiPort(port: CosAiPort, identity: HarnessAiPortIdentity): CosAiPort {
  return Object.freeze({
    generate(input) {
      return withProductionRuntimeHarness({
        runId: `ai-port:${identity.agentId}:${randomUUID()}`,
        objective: identity.objective,
        tenantId: 'itmounts',
        portableId: identity.portableId ?? 'cos',
        agentId: identity.agentId,
        role: identity.role,
        environmentId: 'itmounts-production',
        limits: {
          deadlineMs: identity.deadlineMs ?? 120_000,
          maxToolCalls: 0,
          maxConcurrency: 1,
        },
      }, () => port.generate(input))
    },
  })
}

type GraduateAttempt = Readonly<{ text: string | null; attempted: boolean }>

/** Independently promoted active graduates remain the highest-priority iTMounts-owned workers. */
async function tryActiveGraduate(
  role: 'primary' | 'coder',
  input: { prompt: string; systemPrompt?: string; maxTokens?: number },
  options: { coding?: boolean } = {},
): Promise<GraduateAttempt> {
  if (currentReasoningEvaluationContext()) return { text: null, attempted: false }
  const runtimes = await activeGraduateRuntimesForRole(role, input.prompt).catch(error => {
    console.warn('[platform-graduate-routing] lookup failed closed', error instanceof Error ? error.message : String(error))
    return []
  })
  if (!runtimes.length) return { text: null, attempted: false }

  for (const runtime of runtimes) {
    const text = await callLocalModel({
      prompt: input.prompt,
      systemPrompt: input.systemPrompt,
      maxTokens: input.maxTokens,
      ...(options.coding ? { frequencyPenalty: 0, presencePenalty: 0, jsonObject: true } : {}),
      usageContext: {
        feature: options.coding ? 'builder_graduate' : 'platform_graduate',
        purpose: `${runtime.subjectId}:${role}`,
      },
    }, runtime.inference).catch(error => {
      console.warn('[platform-graduate-routing] graduate failed; lower-priority runtime remains available', JSON.stringify({
        candidateId: runtime.candidateId,
        artifactId: runtime.trainedArtifactId,
        role,
        error: error instanceof Error ? error.message : String(error),
      }))
      return null
    })
    if (text?.trim()) return { text, attempted: true }
  }
  return { text: null, attempted: true }
}

/** Existing DeepInfra Builder model remains the emergency/fallback coding model. */
export function builderCodingModelFromEnv(): string {
  return requireBuilderCodingModel()
}

function requireText(result: string | null, provider: string): string {
  if (!result) throw new Error(`${provider} AI provider returned no text`)
  return result
}

/**
 * Platform text priority:
 * 1. active subject-relevant iTMounts graduate;
 * 2. iTMounts RunPod primary reasoner;
 * 3. existing DeepInfra/open-model gateway fallback.
 */
export function createPlatformAiPort(): CosAiPort {
  const port: CosAiPort = {
    generate: async (input) => {
      const graduate = await tryActiveGraduate('primary', input)
      if (graduate.text) return graduate.text

      const runpod = currentReasoningEvaluationContext()
        ? { text: null, attempted: false }
        : await tryRunpodPrimaryInference({
            prompt: input.prompt,
            systemPrompt: input.systemPrompt,
            maxTokens: input.maxTokens,
            usageContext: { feature: 'platform_runpod_primary', purpose: 'portable_text' },
          }, 'reasoner')
      if (runpod.text) return runpod.text

      return requireText(
        await callCosText({ ...input, modelPreference: 'local', taskId: 'cos-portable-text' }),
        graduate.attempted || runpod.attempted ? 'platform fallback' : 'platform',
      )
    },
  }
  return harnessAiPort(port, {
    agentId: 'cos-platform-ai',
    role: 'platform_ai',
    objective: 'Generate one bounded platform text response.',
  })
}

/**
 * Builder priority:
 * 1. active coder-scoped graduate;
 * 2. RunPod primary coding/reasoning model;
 * 3. DeepSeek V4 Pro on DeepInfra as bounded fallback.
 *
 * A busy RunPod is capacity contention, not provider failure. Builder waits behind the governed
 * single-GPU queue instead of converting that contention into paid DeepInfra traffic.
 */
export function createBuilderCodingAiPort(): CosAiPort {
  const port: CosAiPort = {
    generate: async (input) => {
      const graduate = await tryActiveGraduate('coder', input, { coding: true })
      if (graduate.text) return graduate.text

      const runpod = currentReasoningEvaluationContext()
        ? { text: null, attempted: false, reason: 'reasoning_evaluation_context' }
        : await tryRunpodPrimaryInference({
            prompt: input.prompt,
            systemPrompt: input.systemPrompt,
            maxTokens: input.maxTokens,
            frequencyPenalty: 0,
            presencePenalty: 0,
            jsonObject: true,
            usageContext: { feature: 'builder_runpod_primary', purpose: 'coding_harness' },
          }, 'builder')
      if (runpod.text) return runpod.text
      if (runpod.attempted && runpod.reason === 'runpod_primary_busy') {
        throw new Error('builder_runpod_primary_busy')
      }

      const config = localInferenceConfigFromEnv()
      const ownedAttempted = graduate.attempted || runpod.attempted
      return requireText(await callLocalModel({
        prompt: input.prompt,
        systemPrompt: input.systemPrompt,
        maxTokens: input.maxTokens,
        frequencyPenalty: 0,
        presencePenalty: 0,
        jsonObject: true,
        usageContext: {
          feature: 'builder',
          purpose: ownedAttempted ? 'coding_harness_fallback_from_owned' : 'coding_harness',
        },
      }, {
        ...config,
        model: builderCodingModelFromEnv(),
        fallbackFromOwned: ownedAttempted,
      }), 'builder coding')
    },
  }
  return harnessAiPort(port, {
    agentId: 'cos-builder-ai',
    role: 'software_specialist',
    objective: 'Generate one bounded Builder coding response.',
    portableId: 'builder',
  })
}

export function createLocalApplianceAiPort(): CosAiPort {
  return harnessAiPort({
    generate: async (input) => requireText(await callProviderModel({ ...input, modelPreference: 'local' }), 'local appliance'),
  }, {
    agentId: 'cos-local-appliance-ai',
    role: 'platform_ai',
    objective: 'Generate one bounded local-appliance response.',
  })
}

export function createExternalTeacherAiPort(provider: ExternalTeacherProvider): CosAiPort {
  return harnessAiPort({
    generate: async (input) => requireText(
      await callProviderModel({ ...input, modelPreference: provider }),
      `external teacher ${provider}`,
    ),
  }, {
    agentId: 'cos-external-teacher-ai',
    role: 'external_teacher',
    objective: 'Generate one bounded external-teacher response.',
  })
}

export type CosImageResult = { ok: boolean; b64?: string; url?: string; error?: string }

export interface CosImagePort {
  generate(input: { prompt: string; size?: string }): Promise<CosImageResult>
}


function harnessImagePort(port: CosImagePort): CosImagePort {
  return Object.freeze({
    generate(input) {
      return withProductionRuntimeHarness({
        runId: `image-port:cos-visual-ai:${randomUUID()}`,
        objective: 'Generate one bounded platform visual artifact.',
        tenantId: 'itmounts',
        portableId: 'cos-visuals',
        agentId: 'cos-visual-ai',
        role: 'visual_specialist',
        environmentId: 'itmounts-production',
        limits: { deadlineMs: 120_000, maxToolCalls: 0, maxConcurrency: 1 },
      }, () => port.generate(input))
    },
  })
}

export function createPlatformImagePort(): CosImagePort {
  return harnessImagePort({
    async generate({ prompt, size = '1024x1024' }): Promise<CosImageResult> {
      // Visual creation remains on its separately approved runtime; the text RunPod primary does not
      // repurpose itself as an image worker.
      const key = process.env.LOCAL_AI_API_KEY?.trim()
      const baseUrl = (process.env.LOCAL_AI_BASE_URL || '').replace(/\/$/, '')
      if (!key || !/^https:\/\/api\.deepinfra\.com\/v1\/openai$/i.test(baseUrl)) {
        return { ok: false, error: 'Approved visual runtime is not configured.' }
      }

      try {
        const response = await fetch('https://api.deepinfra.com/v1/openai/images/generations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: 'black-forest-labs/FLUX-2-klein-4b',
            prompt: freshVisualPrompt(prompt),
            size,
            n: 1,
          }),
          signal: currentHarnessExecutionContext()?.signal,
        })
        const raw = await response.text()
        let data: { data?: Array<{ b64_json?: string; url?: string }>; error?: { message?: string } | string; detail?: string | { message?: string }; message?: string } = {}
        try { data = JSON.parse(raw) } catch { /* provider returned a non-JSON error */ }
        if (!response.ok) {
          const detail = typeof data.error === 'string'
            ? data.error
            : data.error?.message || (typeof data.detail === 'string' ? data.detail : data.detail?.message) || data.message || raw.slice(0, 240)
          console.warn('[concierge-visual-runtime-failure]', JSON.stringify({ status: response.status, detail: detail || 'no_provider_error_detail' }))
          return { ok: false, error: detail || `Approved visual runtime failed (HTTP ${response.status}).` }
        }
        const first = data.data?.[0]
        return first?.b64_json ? { ok: true, b64: first.b64_json, url: first.url } : { ok: false, error: 'Creative image provider returned no image.' }
      } catch (e: any) {
        return { ok: false, error: e?.message || 'Creative image generation failed.' }
      }
    },
  })
}

