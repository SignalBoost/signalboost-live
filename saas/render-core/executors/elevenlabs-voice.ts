// saas/render-core/executors/elevenlabs-voice.ts
//
// Portable voiceover executor (ElevenLabs). Calls the ElevenLabs HTTP API
// directly — no host imports — and self-registers with the render engine.
// Adding a provider elsewhere follows this exact shape (see ONBOARD.md §12C).

import { registerRenderer } from '../engine'
import type { RenderExecutor, RenderInput, RenderProduced } from '../types'

const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1'
const DEFAULT_MODEL_ID = 'eleven_multilingual_v2'

const CENTS_PER_1K_CHARS = Number(process.env.ELEVENLABS_CENTS_PER_1K_CHARS || '18')

function textOf(input: RenderInput): string {
  const t = input.params?.text
  return typeof t === 'string' ? t : ''
}

export const elevenLabsVoiceExecutor: RenderExecutor = {
  providerId: 'elevenlabs',
  kind: 'voice',

  estimateCostCents(input: RenderInput): number {
    const chars = textOf(input).length
    if (chars <= 0) return 0
    return Math.ceil((chars / 1000) * CENTS_PER_1K_CHARS)
  },

  async produce(input: RenderInput, apiKey: string): Promise<RenderProduced> {
    const text = textOf(input)
    if (!text) throw new Error('Voiceover text is required.')

    const voiceId = String(input.params?.voiceId || '')
    if (!voiceId) throw new Error('A voiceId is required.')

    const modelId = String(input.params?.modelId || DEFAULT_MODEL_ID)
    const stability = Number(input.params?.stability ?? 0.5)
    const similarityBoost = Number(input.params?.similarityBoost ?? 0.75)
    const style = Number(input.params?.style ?? 0)

    const res = await fetch(`${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: { stability, similarity_boost: similarityBoost, style, use_speaker_boost: true },
      }),
    })

    if (res.status === 401 || res.status === 403) throw new Error('ElevenLabs rejected the API key.')
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`ElevenLabs error ${res.status}: ${detail || res.statusText}`)
    }

    const bytes = await res.arrayBuffer()
    return { bytes, contentType: 'audio/mpeg', units: text.length }
  },
}

registerRenderer(elevenLabsVoiceExecutor)
