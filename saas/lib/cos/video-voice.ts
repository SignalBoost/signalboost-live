// saas/lib/cos/video-voice.ts
// Adds a real spoken voiceover to a campaign's rendered (Kling) video, fully
// managed: ElevenLabs TTS of the script → upload → fal ffmpeg merge-audio-video.
// Runs entirely from Vercel; no self-hosted FFmpeg worker. Captions are added in
// a follow-up step (fal compose with an SRT track).
//
// tsconfig non-strict: flat results; never throws to callers.

import { createClient } from '@supabase/supabase-js'
import { fal } from '@fal-ai/client'
import { generateSpeech } from '@/lib/elevenlabs/client'

const RENDER_BUCKET = 'video-renders'

// Curated ElevenLabs voices per language (multilingual model handles all five).
const VOICE_BY_LANG: Record<string, string> = {
  en: 'EXAVITQu4vr4xnSDxMaL',
  es: '9BWtsMINqrJLrRacOk9x',
  pt: 'XB0fDUnXU5powFXDhCwa',
  pl: 'ThT5KcBeYPX3keUQqHPh',
  ru: 'z9fAnlkpzviPz146aGWa',
}

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

let falConfigured = false
function ensureFal() {
  if (!falConfigured) { fal.config({ credentials: process.env.FAL_KEY }); falConfigured = true }
}

// Concise narration that fits a short promo clip. Uses the per-language draft's
// title, falling back to campaign fields. Kept short so the voice matches the clip.
function narrationFor(campaign: any, lang: string): string {
  const items = Array.isArray(campaign.work_items) ? campaign.work_items : []
  const match = items.find((it: any) => it?.input?.language === lang && it?.output) || items.find((it: any) => it?.output)
  const o = (match && match.output) || {}
  const base = String(o.title || campaign.title || campaign.objective || 'SignalBoost helps your business grow.')
  return base.replace(/\s+/g, ' ').trim().slice(0, 240)
}

export async function addVoiceToCampaignVideo(campaign: any, lang: string = 'en'): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const videoUrl = campaign?.metadata?.video?.url
    if (!videoUrl) return { ok: false, error: 'No rendered video to voice.' }

    const voiceId = VOICE_BY_LANG[lang] || VOICE_BY_LANG.en
    const text = narrationFor(campaign, lang)

    // 1) Text → speech (mp3 bytes)
    let audio: ArrayBuffer
    try { audio = await generateSpeech({ text, voiceId }) } catch (e: any) { return { ok: false, error: `TTS failed: ${e?.message || 'unknown'}` } }

    // 2) Upload mp3 and sign a URL fal can fetch
    const sb = db()
    const path = `cos-voice/${campaign.id}/${lang}-${Date.now()}.mp3`
    const up = await sb.storage.from(RENDER_BUCKET).upload(path, Buffer.from(audio), { contentType: 'audio/mpeg', upsert: true })
    if (up.error) return { ok: false, error: `audio upload failed: ${up.error.message}` }
    const signed = await sb.storage.from(RENDER_BUCKET).createSignedUrl(path, 60 * 60 * 6)
    const audioUrl = signed.data?.signedUrl
    if (!audioUrl) return { ok: false, error: 'could not sign audio url' }

    // 3) Merge audio + video via fal (managed FFmpeg)
    ensureFal()
    const result: any = await fal.subscribe('fal-ai/ffmpeg-api/merge-audio-video', {
      input: { video_url: String(videoUrl), audio_url: audioUrl },
    })
    const out = result?.data?.video?.url
    if (!out) return { ok: false, error: 'merge returned no video url' }
    return { ok: true, url: String(out) }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'voice compose failed' }
  }
}
