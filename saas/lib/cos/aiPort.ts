// saas/lib/cos/aiPort.ts
// Injected model-access seam for COS generators. Text requests enter the shared COS gateway so
// existing Portables gain durable reuse and single-flight protection without owning provider logic.
import { callLocalModel, localInferenceConfigFromEnv } from '@/lib/ai/local-inference'
import { callProviderModel, type ModelProvider } from '@/lib/ai/providerRouter'
import { callCosText } from '@/lib/cos/textGateway'
import { requireBuilderCodingModel } from '@/lib/ai/cos/platformIdentityContext'
import { activeGraduateRuntimesForRole } from '@/lib/ai/cos/cosUniversityGraduateRuntime'
import { currentReasoningEvaluationContext } from '@/lib/ai/cos/reasoningEvaluationContext'
import { freshVisualPrompt } from '@/lib/visuals/freshGeneration'

export interface CosAiPort {
  generate(input: { prompt: string; systemPrompt?: string; maxTokens?: number; modelPreference?: ModelProvider }): Promise<string>
}

export type ExternalTeacherProvider = Exclude<ModelProvider, 'local'>

type GraduateAttempt = Readonly<{ text: string | null; attempted: boolean }>

/**
 * Reuse the same independently promoted + active graduate registry as the COS control plane.
 * Academic/controlled-comparison contexts remain excluded, and role/problem scope comes from the
 * activation evidence rather than from a hard-coded "all graduates can do everything" rule.
 */
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
      console.warn('[platform-graduate-routing] graduate failed; base runtime remains available', JSON.stringify({
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

/**
 * Execution path: no default, no substitution. An unset DEEPINFRA_BUILDER_MODEL throws
 * `builder_model_not_configured` rather than quietly sending a guessed model to the provider.
 */
export function builderCodingModelFromEnv(): string {
  return requireBuilderCodingModel()
}

function requireText(result: string | null, provider: string): string {
  if (!result) throw new Error(`${provider} AI provider returned no text`)
  return result
}

/**
 * First-party iTMounts/COS text generation now checks an active, scoped iTMounts graduate first.
 * When no relevant graduate is active (or it fails), the existing governed open-model gateway is the
 * bounded fallback. This extends University adoption to Portables/autonomy/business generators, not
 * only the COS reasoning-engine worker pool.
 */
export function createPlatformAiPort(): CosAiPort {
  return {
    generate: async (input) => {
      const graduate = await tryActiveGraduate('primary', input)
      if (graduate.text) return graduate.text
      return requireText(
        await callCosText({ ...input, modelPreference: 'local', taskId: 'cos-portable-text' }),
        graduate.attempted ? 'platform fallback' : 'platform',
      )
    },
  }
}

/**
 * Coding-specialist port for Builder and Platform Engineer.
 *
 * An active coder-scoped graduate may run first. A reasoning-only graduate cannot enter this path
 * because activeGraduateRuntimesForRole requires the registry's exact worker/problem scope. The
 * ordinary Builder coding model remains directly behind it as the deterministic fallback.
 */
export function createBuilderCodingAiPort(): CosAiPort {
  return {
    generate: async (input) => {
      const graduate = await tryActiveGraduate('coder', input, { coding: true })
      if (graduate.text) return graduate.text

      const config = localInferenceConfigFromEnv()
      return requireText(await callLocalModel({
        prompt: input.prompt,
        systemPrompt: input.systemPrompt,
        maxTokens: input.maxTokens,
        // Source code is legitimately repetitive. The prose reasoner's repetition penalties
        // accumulate over a generated file and push the sampler off valid syntax, so coding
        // calls generate unpenalised.
        frequencyPenalty: 0,
        presencePenalty: 0,
        // The control object must be JSON. Provider-enforced JSON mode removes the class of
        // failures where source quoting or escaping breaks the surrounding envelope.
        jsonObject: true,
        usageContext: { feature: 'builder', purpose: graduate.attempted ? 'coding_harness_fallback_from_owned' : 'coding_harness' },
      }, {
        ...config,
        model: builderCodingModelFromEnv(),
        fallbackFromOwned: graduate.attempted,
      }), 'builder coding')
    },
  }
}

export function createLocalApplianceAiPort(): CosAiPort {
  return {
    generate: async (input) => requireText(await callProviderModel({ ...input, modelPreference: 'local' }), 'local appliance'),
  }
}

export function createExternalTeacherAiPort(provider: ExternalTeacherProvider): CosAiPort {
  return {
    generate: async (input) => requireText(
      await callProviderModel({ ...input, modelPreference: provider }),
      `external teacher ${provider}`,
    ),
  }
}

export type CosImageResult = { ok: boolean; b64?: string; url?: string; error?: string }

export interface CosImagePort {
  generate(input: { prompt: string; size?: string }): Promise<CosImageResult>
}

export function createPlatformImagePort(): CosImagePort {
  return {
    async generate({ prompt, size = '1024x1024' }): Promise<CosImageResult> {
      // Text-graduate routing does not repurpose a text model as a visual model. Visual creation
      // remains on its separately approved runtime until a visual graduate has its own governed path.
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
  }
}
