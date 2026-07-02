// saas/lib/cos/video-voice.ts
// Adds a real spoken voiceover to a campaign's rendered (Kling) video AND
// stretches the short clip to match the narration (up to ~60s), fully managed:
//
//   ElevenLabs TTS  ->  base64 data URI  ->  fal ffmpeg "compose" timeline
//     - video track: the ~5s Kling clip looped to cover the narration length
//     - audio track: the narration voiceover
//   then captions are burned from OUR OWN known-correct script text via an
//   SRT we generate ourselves (veed/subtitles with srt_text) — NOT from
//   auto-transcribing the resulting audio. FIX: the previous captioner
//   (fal-ai/workflow-utilities/auto-subtitle) re-transcribes the synthesized
//   voice via ASR, which has no way to know "SignalBoostAi" or the exact URL
//   spelling and can mis-hear them. Since we already know precisely what was
//   said (it's the same text we sent to TTS), there's nothing to transcribe —
//   only to time. veed/subtitles skips transcription entirely when srt_text
//   is provided, so caption text now matches the script byte-for-byte.
//
// Runs entirely from Vercel — no self-hosted FFmpeg and no storage bucket
// (the audio is handed to fal as a base64 data URI, so nothing is uploaded).
//
// tsconfig non-strict: flat { ok, error? } results; never throws to callers.

import { fal } from '@fal-ai/client'
import { generateSpeech } from '@/lib/elevenlabs/client'

const COMPOSE_MODEL = 'fal-ai/ffmpeg-api/compose'
const METADATA_MODEL = 'fal-ai/ffmpeg-api/metadata'
const SUBTITLE_MODEL = 'veed/subtitles' // srt_text bypasses ASR transcription entirely
const SITE_URL = 'www.saas.signalboostapp.com'
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

function normalizeUrlText(text: string): string {
  return String(text || '')
    .replace(/https?:\/\/www\.saas\.signalboostapp\.com/gi, SITE_URL)
    .replace(/https?:\/\/saas\.signalboostapp\.com/gi, SITE_URL)
    .replace(/\bwww\.saas\.signalboostapp\.com\b/gi, SITE_URL)
    .replace(/\bsaas\.signalboostapp\.com\b/gi, SITE_URL)
    .replace(/\bwww\.saas\.signalboost\.com\b/gi, SITE_URL)
    .replace(/\bsignalboost\.com\b/gi, SITE_URL)
    .replace(/www\.www\./gi, 'www.')
}

// Build a spoken script from the per-language draft. Long enough to fill up to a
// minute, capped on a sentence boundary, and always ends by speaking the exact
// public URL so it shows up correctly in the burned captions.
function narrationFor(campaign: any, lang: string): string {
  const items = Array.isArray(campaign.work_items) ? campaign.work_items : []
  const match =
    items.find((it: any) => it?.input?.language === lang && it?.output) ||
    items.find((it: any) => it?.output)
  const o = (match && match.output) || {}
  const parts = [o.title, o.opening, o.draft, o.call_to_action]
    .map((v: any) => normalizeUrlText(String(v || '').replace(/\s+/g, ' ').trim()))
    .filter(Boolean)
  let text = parts.join('. ').replace(/\.\s*\.+/g, '.').replace(/\s+/g, ' ').trim()
  if (!text) {
    const t = String(campaign.title || 'SignalBoostAi')
    text = `${t}. SignalBoostAi helps companies grow faster with AI-built websites, branded content, outreach campaigns, and growth tools. Automate your marketing, launch new campaigns in minutes, reach more customers across every channel, and scale with confidence. See how it works and get started today.`
  }
  text = normalizeUrlText(text)
  if (text.length > 760) {
    text = text.slice(0, 760)
    const cut = Math.max(text.lastIndexOf('. '), text.lastIndexOf('! '), text.lastIndexOf('? '))
    if (cut > 380) text = text.slice(0, cut + 1)
  }
  text = normalizeUrlText(text)
  if (!text.toLowerCase().includes(SITE_URL)) {
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

function formatSrtTime(ms: number): string {
  const totalMs = Math.max(0, Math.round(ms))
  const h = Math.floor(totalMs / 3600000)
  const m = Math.floor((totalMs % 3600000) / 60000)
  const s = Math.floor((totalMs % 60000) / 1000)
  const msRem = totalMs % 1000
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(msRem, 3)}`
}

// Build our OWN subtitles from the EXACT text sent to TTS, with timing
// distributed proportionally by word count across the real audio duration.
// This deliberately replaces ASR-based auto-transcription: since we already
// know precisely what was said, there is nothing to transcribe, only to time.
function buildSrt(text: string, totalMs: number, wordsPerLine = 7): string {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0 || totalMs <= 0) return ''
  const lines: string[] = []
  for (let i = 0; i < words.length; i += wordsPerLine) {
    lines.push(words.slice(i, i + wordsPerLine).join(' '))
  }
  const totalWords = words.length
  let cursorMs = 0
  let idx = 1
  const blocks: string[] = []
  for (const line of lines) {
    const lineWordCount = line.split(/\s+/).filter(Boolean).length
    const lineMs = Math.round((lineWordCount / totalWords) * totalMs)
    const startMs = cursorMs
    const endMs = Math.min(totalMs, cursorMs + lineMs)
    blocks.push(`${idx}\n${formatSrtTime(startMs)} --> ${formatSrtTime(endMs)}\n${line}\n`)
    cursorMs = endMs
    idx += 1
  }
  return blocks.join('\n')
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

    // 4) Burn captions from OUR OWN known-correct script text, not ASR
    //    transcription of the synthesized audio — so brand names and URLs
    //    are never mis-heard. Graceful: if captioning fails, return the
    //    voiced (uncaptioned) video rather than erroring the whole step.
    try {
      const srt = buildSrt(text, totalMs)
      if (srt) {
        const cap: any = await fal.subscribe(SUBTITLE_MODEL, {
          input: { video_url: finalUrl, srt_text: srt, preset: 'simple' },
        })
        const capUrl = cap?.data?.video?.url
        if (capUrl) finalUrl = String(capUrl)
      }
    } catch {}

    return { ok: true, url: finalUrl }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'voice compose failed' }
  }
}
