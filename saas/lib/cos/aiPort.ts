// saas/lib/cos/aiPort.ts
// Injected model-access seam for COS generators. Text requests enter the shared COS gateway so
// existing Portables gain durable reuse and single-flight protection without owning provider logic.
import { callLocalModel, localInferenceConfigFromEnv } from '@/lib/ai/local-inference'
import { callProviderModel, type ModelProvider } from '@/lib/ai/providerRouter'
import { callCosText } from '@/lib/cos/textGateway'
import { requireBuilderCodingModel } from '@/lib/ai/cos/platformIdentityContext'
import { freshVisualPrompt } from '@/lib/visuals/freshGeneration'

export interface CosAiPort {
  generate(input: { prompt: string; systemPrompt?: string; maxTokens?: number; modelPreference?: ModelProvider }): Promise<string>
}

export type ExternalTeacherProvider = Exclude<ModelProvider, 'local'>

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
 * First-party iTMounts/COS text generation is platform-owned-graduate first after an exact graduate
 * becomes active for general reasoning. Until then it uses the existing approved open-model runtime.
 * Closed-model provider hints remain ignored at this boundary.
 */
export function createPlatformAiPort(): CosAiPort {
  return {
    generate: async (input) => requireText(
      await callCosText({
        ...input,
        modelPreference: 'local',
        taskId: 'cos-portable-text',
        usageContext: {
          feature: 'cos_platform_text',
          agentId: 'cos',
          purpose: 'platform_reasoning',
          subjectId: 'reasoning_decision_science',
        },
      }),
      'platform',
    ),
  }
}

/**
 * Coding-specialist port for Builder and Platform Engineer.
 *
 * The same graduate selector is available here, but the capability is explicitly computer_science.
 * A reasoning_decision_science graduate therefore cannot replace Builder's coding model. A future
 * promoted computer-science graduate can, after its own runtime activation evidence clears.
 */
export function createBuilderCodingAiPort(): CosAiPort {
  return {
    generate: async (input) => {
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
        usageContext: {
          feature: 'builder',
          purpose: 'coding_harness',
          subjectId: 'computer_science',
        },
      }, {
        ...config,
        model: builderCodingModelFromEnv(),
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
      // Visual creation uses only the approved COS managed runtime. Graduate text routing does not
      // silently repurpose a text LoRA artifact as an image model.
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
