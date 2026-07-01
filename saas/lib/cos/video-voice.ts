// saas/lib/cos/video-voice.ts
// Adds a real spoken voiceover to a campaign's rendered (Kling) video AND
// stretches the short clip to match the narration (up to ~60s), fully managed:
//
//   ElevenLabs TTS  ->  base64 data URI  ->  fal ffmpeg "compose" timeline
//     - video track: the ~5s Kling clip looped to cover the narration length
//     - audio track: the narration voiceover
//   then fal auto-subtitle burns captions synced to the voice.
//
// Runs entirely from Vercel — no self-hosted FFmpeg and no storage bucket
// (the audio is handed to fal as a base64 data URI, so nothing is uploaded).
//
// tsconfig non-strict: flat { ok, error? } results; never throws to callers.

import { fal } from '@fal-ai/client'
import { generateSpeech } from '@/lib/elevenlabs/client'

const COMPOSE_MODEL = 'fal-ai/ffmpeg-api/compose'
const METADATA_MODEL = 'fal-ai/ffmpeg-api/metadata'
const CAPTION_MODEL = 'fal-ai/workflow-utilities/auto-subtitle' // transcribes audio -> burns synced captions
const SITE_URL = 'saas.signalboostapp.com'
const CLIP_MS = 5000        // Kling v3 standard renders ~5s clips
const MIN_TOTAL_MS = 6000   // floor so a one-line VO still has room
const MAX_TOTAL_MS = 60000  // cap the final video at one minute

// Curated ElevenLabs voices per language (multilingual model handles all five).
const VOICE_BY_LANG: Record<string, string> = {
  en: 'EXAVITQu4vr4xnSDxMaL',
  es: '9BWtsMINqrJLrRacOk9x',
  pt: 'XB0fDUnXU5powFXDhCwa',
  pl: 'ThT5KcBeYPX3keUQqHPh',
  ru: 'z9fAnlkpzviPz146aGWa',
}

let falConfigured = false
function ensureFal() {
  if (!falConfigured) { fal.config({ credentials: process.env.FAL_KEY }); falConfigured = true }
}

// Build a spoken script from the per-language draft. Long enough to fill up to a
// minute, capped on a sentence boundary, and always ends by speaking the site URL
// so it shows up in the burned captions.
function narrationFor(campaign: any, lang: string): string {
  const items = Array.isArray(campaign.work_items) ? campaign.work_items : []
  const match =
    items.find((it: any) => it?.input?.language === lang && it?.output) ||
    items.find((it: any) => it?.output)
  const o = (match && match.output) || {}
  const parts = [o.title, o.opening, o.draft, o.call_to_action]
    .map((v: any) => String(v || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  let text = parts.join('. ').replace(/\.\s*\.+/g, '.').replace(/\s+/g, ' ').trim()
  if (!text) text = String(campaign.title || campaign.objective || 'SignalBoost helps your business grow faster.')
  if (text.length > 760) {
    text = text.slice(0, 760)
    const cut = Math.max(text.lastIndexOf('. '), text.lastIndexOf('! '), text.lastIndexOf('? '))
    if (cut > 380) text = text.slice(0, cut + 1)
  }
  if (!/signalboostapp\.com/i.test(text)) {
    text = `${text} Visit ${SITE_URL}.`.replace(/\s+/g, ' ').trim()
  }
  return text
}

// Rough fallback if fal metadata is unavailable: ~150 wpm, padded 15% so the
// audio is never cut (a short silent tail is fine; a clipped VO is not).
function estimateMs(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length
  return Math.round((words / 2.5) * 1000 * 1.15)
}

// Read the real audio duration (seconds) from fal metadata; fall back to estimate.
async function probeAudioMs(dataUri: string, fallbackMs: number): Promise<number> {
  try {
    const r: any = await fal.subscribe(METADATA_MODEL, { input: { media_url: dataUri } })
    const d = r?.data || {}
    const sec =
      d?.media?.duration ??
      d?.duration ??
      d?.audio?.duration ??
      (Array.isArray(d?.streams) ? d.streams.find((s: any) => s?.duration)?.duration : undefined)
    const ms = Number(sec) * 1000
    if (Number.isFinite(ms) && ms > 500) return ms
  } catch {}
  return fallbackMs
}

// Tile the short clip across [0, totalMs); the last keyframe is truncated so the
// video length matches the voice exactly.
function buildVideoKeyframes(url: string, totalMs: number) {
  const frames: { timestamp: number; duration: number; url: string }[] = []
  let t = 0
  while (t < totalMs) {
    const dur = Math.min(CLIP_MS, totalMs - t)
    frames.push({ timestamp: t, duration: dur, url })
    t += dur
  }
  return frames
}

export async function addVoiceToCampaignVideo(
  campaign: any,
  lang: string = 'en'
): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const videoUrl = campaign?.metadata?.video?.url
    if (!videoUrl) return { ok: false, error: 'No rendered video to voice.' }

    const voiceId = VOICE_BY_LANG[lang] || VOICE_BY_LANG.en
    const text = narrationFor(campaign, lang)

    // 1) Text -> speech (mp3 bytes) -> base64 data URI (no storage bucket needed).
    let audio: ArrayBuffer
    try {
      audio = await generateSpeech({ text, voiceId })
    } catch (e: any) {
      return { ok: false, error: `TTS failed: ${e?.message || 'unknown'}` }
    }
    const audioDataUri = `data:audio/mpeg;base64,${Buffer.from(audio).toString('base64')}`

    ensureFal()

    // 2) Decide final length from the real narration duration, capped at one minute.
    const fallbackMs = Math.min(Math.max(estimateMs(text), MIN_TOTAL_MS), MAX_TOTAL_MS)
    const audioMs = await probeAudioMs(audioDataUri, fallbackMs)
    const totalMs = Math.min(Math.max(Math.ceil(audioMs), MIN_TOTAL_MS), MAX_TOTAL_MS)

    // 3) Compose: loop the short clip across the timeline, lay the voice on top.
    const tracks = [
      { id: 'video', type: 'video', keyframes: buildVideoKeyframes(String(videoUrl), totalMs) },
      { id: 'voice', type: 'audio', keyframes: [{ timestamp: 0, duration: totalMs, url: audioDataUri }] },
    ]
    const result: any = await fal.subscribe(COMPOSE_MODEL, { input: { tracks } })
    let finalUrl = String(result?.data?.video_url || result?.data?.video?.url || '')
    if (!finalUrl) return { ok: false, error: 'compose returned no video url' }

    // 4) Burn captions synced to the voice — graceful: if captioning fails, return
    //    the voiced (uncaptioned) video rather than erroring the whole step.
    try {
      const cap: any = await fal.subscribe(CAPTION_MODEL, {
        input: {
          video_url: finalUrl,
          language: lang,
          position: 'bottom',
          words_per_subtitle: 7,
          font_size: 52,
          font_color: 'white',
          stroke_color: 'black',
          stroke_width: 2,
          y_offset: 80,
          enable_animation: false,
        },
      })
      const capUrl = cap?.data?.video?.url || cap?.data?.video_url
      if (capUrl) finalUrl = String(capUrl)
    } catch {}

    return { ok: true, url: finalUrl }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'voice compose failed' }
  }
}
