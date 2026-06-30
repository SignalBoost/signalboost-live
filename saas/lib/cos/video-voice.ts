// saas/lib/cos/video-voice.ts
// Managed COS campaign voice/video helper: creates ElevenLabs narration and
// submits a fal.ai video-to-video pass that can attach the narration to the
// current campaign render without adding client-side dependencies.
import { fal } from '@fal-ai/client'
import { generateSpeech } from '@/lib/elevenlabs/client'
import { CURATED_VOICES } from '@/lib/elevenlabs/voices'

const VOICE_VIDEO_MODEL = 'fal-ai/ffmpeg-api/compose'

let configured = false
function ensureFalConfigured() {
  if (!configured) {
    fal.config({ credentials: process.env.FAL_KEY })
    configured = true
  }
}

export type VoiceVideoResult =
  | { ok: true; requestId: string; model: string; voiceId: string; audioDataUrl: string }
  | { ok: false; error: string }

export function defaultCosVoiceId(language?: string): string {
  const lang = String(language || 'en').toLowerCase().slice(0, 2)
  const match = CURATED_VOICES.find(voice => voice.locale.toLowerCase().startsWith(lang))
  return match?.id || CURATED_VOICES[0]?.id || '21m00Tcm4TlvDq8ikWAM'
}

export function campaignNarration(campaign: any, language?: string): string {
  const items = Array.isArray(campaign?.work_items) ? campaign.work_items : []
  const item = language
    ? items.find((it: any) => it?.input?.language === language && it?.output)
    : items.find((it: any) => it?.output)
  const output = item?.output || {}
  const parts = [output.opening, output.draft, output.call_to_action]
    .map(value => String(value || '').trim())
    .filter(Boolean)
  const fallback = [campaign?.title, campaign?.objective, 'Visit saas.signalboostapp.com to grow faster with SignalBoost.']
    .map(value => String(value || '').trim())
    .filter(Boolean)
  return (parts.length ? parts : fallback).join('\n\n').slice(0, 4_500)
}

export async function startManagedVoiceVideo(opts: {
  campaign: any
  language?: string
  videoUrl?: string
  voiceId?: string
  narration?: string
}): Promise<VoiceVideoResult> {
  try {
    const videoUrl = String(opts.videoUrl || opts.campaign?.metadata?.video?.url || '').trim()
    if (!videoUrl) return { ok: false, error: 'A ready video URL is required before adding voice.' }

    const narration = String(opts.narration || campaignNarration(opts.campaign, opts.language)).trim()
    if (!narration) return { ok: false, error: 'A narration script is required.' }

    const voiceId = String(opts.voiceId || defaultCosVoiceId(opts.language)).trim()
    const audio = await generateSpeech({ text: narration, voiceId })
    const audioDataUrl = `data:audio/mpeg;base64,${Buffer.from(audio).toString('base64')}`

    ensureFalConfigured()
    const submitted = await (fal.queue as any).submit(VOICE_VIDEO_MODEL, {
      input: {
        video_url: videoUrl,
        audio_url: audioDataUrl,
        output_format: 'mp4',
      },
    })
    const requestId = (submitted as { request_id?: string }).request_id
    if (!requestId) return { ok: false, error: 'No request id returned from fal.' }
    return { ok: true, requestId, model: VOICE_VIDEO_MODEL, voiceId, audioDataUrl }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Could not start voice video.'
    console.error('startManagedVoiceVideo error:', message)
    return { ok: false, error: message }
  }
}
