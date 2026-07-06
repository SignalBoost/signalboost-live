// saas/lib/cos/video-voice.ts
// Stable COSA voice/caption composer: loops the short base clip under a spoken
// narration, burns captions, then hands the result to the brand-banner worker.

import { fal } from '@fal-ai/client'
import { generateSpeech } from '@/lib/elevenlabs/client'
import { FALLBACK_VOICEOVER_MS, isVoiceQuotaError, silentWavDataUri } from '@/lib/cos/video-silent-fallback'

const COMPOSE_MODEL = 'fal-ai/ffmpeg-api/compose'
const METADATA_MODEL = 'fal-ai/ffmpeg-api/metadata'
const SUBTITLE_MODEL = 'veed/subtitles'
const SITE_URL = 'www.saas.signalboostapp.com'
const CLIP_MS = 5000
const MIN_TOTAL_MS = 6000
const MAX_TOTAL_MS = 60000

const VOICE_BY_LANG: Record<string, string> = {
  en: 'EXAVITQu4vr4xnSDxMaL',
  es: '9BWtsMINqrJLrRacOk9x',
  pt: 'XB0fDUnXU5powFXDhCwa',
  pl: 'ThT5KcBeYPX3keUQqHPh',
  ru: 'z9fAnlkpzviPz146aGWa',
}

let providerConfigured = false
function ensureProvider() {
  if (!providerConfigured) {
    fal.config({ credentials: process.env['FAL_' + 'KEY'] })
    providerConfigured = true
  }
}

function normalizeUrlText(text: string): string {
  let out = String(text || '')
  out = out.replace(/(?:https?:\/\/)?(?:www\.)?(?:saas\.)?signalboost?ap{1,3}\.com(?:\/[^\s,.!?)]*)?/gi, SITE_URL)
  out = out.replace(/(?:https?:\/\/)?(?:www\.)?signalboost\.com(?:\/[^\s,.!?)]*)?/gi, SITE_URL)
  out = out.replace(/(?:www\.)+www\./gi, 'www.')
  out = out.replace(new RegExp(`(${SITE_URL.replace(/\./g, '\\.')})(?:\s*\1)+`, 'gi'), '$1')
  return out
}

function narrationFor(campaign: any, lang: string): string {
  const items = Array.isArray(campaign.work_items) ? campaign.work_items : []
  const match = items.find((it: any) => it?.input?.language === lang && it?.output) || items.find((it: any) => it?.output)
  const output = (match && match.output) || {}
  const parts = [output.title, output.opening, output.draft, output.call_to_action]
    .map((value: any) => normalizeUrlText(String(value || '').replace(/\s+/g, ' ').trim()))
    .filter(Boolean)

  let text = parts.join('. ').replace(/\.\s*\.+/g, '.').replace(/\s+/g, ' ').trim()
  if (!text) {
    const title = String(campaign.title || 'SignalBoostAi')
    text = `${title}. SignalBoostAi helps companies grow faster with AI-built websites, branded content, outreach campaigns, and growth tools. Automate your marketing, launch new campaigns in minutes, reach more customers across every channel, and scale with confidence. See how it works and get started today.`
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

function estimateMs(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length
  return Math.round((words / 2.5) * 1000 * 1.15)
}

async function probeAudioMs(dataUri: string, fallbackMs: number): Promise<number> {
  try {
    const result: any = await fal.subscribe(METADATA_MODEL, { input: { media_url: dataUri } })
    const data = result?.data || {}
    const seconds = data?.media?.duration ?? data?.duration ?? data?.audio?.duration ?? (Array.isArray(data?.streams) ? data.streams.find((stream: any) => stream?.duration)?.duration : undefined)
    const ms = Number(seconds) * 1000
    if (Number.isFinite(ms) && ms > 500) return ms
  } catch {}
  return fallbackMs
}

function buildVideoKeyframes(url: string, totalMs: number) {
  const frames: { timestamp: number; duration: number; url: string }[] = []
  let t = 0
  while (t < totalMs) {
    const duration = Math.min(CLIP_MS, totalMs - t)
    frames.push({ timestamp: t, duration, url })
    t += duration
  }
  return frames
}

function formatSrtTime(ms: number): string {
  const totalMs = Math.max(0, Math.round(ms))
  const h = Math.floor(totalMs / 3600000)
  const m = Math.floor((totalMs % 3600000) / 60000)
  const s = Math.floor((totalMs % 60000) / 1000)
  const msRem = totalMs % 1000
  const pad = (value: number, len = 2) => String(value).padStart(len, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(msRem, 3)}`
}

function buildSrt(text: string, totalMs: number, wordsPerLine = 7): string {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0 || totalMs <= 0) return ''
  const lines: string[] = []
  for (let i = 0; i < words.length; i += wordsPerLine) lines.push(words.slice(i, i + wordsPerLine).join(' '))

  const totalWords = words.length
  let cursorMs = 0
  let index = 1
  const blocks: string[] = []
  for (const line of lines) {
    const wordCount = line.split(/\s+/).filter(Boolean).length
    const lineMs = Math.round((wordCount / totalWords) * totalMs)
    const startMs = cursorMs
    const endMs = Math.min(totalMs, cursorMs + lineMs)
    blocks.push(`${index}\n${formatSrtTime(startMs)} --> ${formatSrtTime(endMs)}\n${line}\n`)
    cursorMs = endMs
    index += 1
  }
  return blocks.join('\n')
}

export async function addVoiceToCampaignVideo(campaign: any, lang: string = 'en'): Promise<{ ok: boolean; url?: string; error?: string; fallback?: boolean; fallbackReason?: string }> {
  try {
    const videoUrl = campaign?.metadata?.video?.url
    if (!videoUrl) return { ok: false, error: 'No rendered video to voice.' }

    const voiceId = VOICE_BY_LANG[lang] || VOICE_BY_LANG.en
    const text = narrationFor(campaign, lang)

    let audioDataUri = ''
    let fallback = false
    let fallbackReason = ''
    const fallbackMs = Math.min(Math.max(estimateMs(text), MIN_TOTAL_MS), MAX_TOTAL_MS)
    let audioMs = fallbackMs

    try {
      const audio = await generateSpeech({ text, voiceId })
      audioDataUri = `data:audio/mpeg;base64,${Buffer.from(audio).toString('base64')}`
      ensureProvider()
      audioMs = await probeAudioMs(audioDataUri, fallbackMs)
    } catch (error: any) {
      if (!isVoiceQuotaError(error)) return { ok: false, error: `TTS failed: ${error?.message || 'unknown'}` }
      fallback = true
      fallbackReason = `COMPLETED_FALLBACK: ElevenLabs unavailable, used silent ${Math.round(FALLBACK_VOICEOVER_MS / 1000)}s narration spacer.`
      audioMs = FALLBACK_VOICEOVER_MS
      audioDataUri = silentWavDataUri(audioMs)
      ensureProvider()
    }

    const totalMs = Math.min(Math.max(Math.ceil(audioMs), MIN_TOTAL_MS), MAX_TOTAL_MS)

    const tracks = [
      { id: 'video', type: 'video', keyframes: buildVideoKeyframes(String(videoUrl), totalMs) },
      { id: 'voice', type: 'audio', keyframes: [{ timestamp: 0, duration: totalMs, url: audioDataUri }] },
    ]

    const result: any = await fal.subscribe(COMPOSE_MODEL, { input: { tracks } })
    let finalUrl = String(result?.data?.video_url || result?.data?.video?.url || '')
    if (!finalUrl) return { ok: false, error: 'compose returned no video url' }

    try {
      const srt = buildSrt(text, totalMs)
      if (srt) {
        const captions: any = await fal.subscribe(SUBTITLE_MODEL, { input: { video_url: finalUrl, srt_text: srt, preset: 'simple' } })
        const captionedUrl = captions?.data?.video?.url
        if (captionedUrl) finalUrl = String(captionedUrl)
      }
    } catch {}

    return { ok: true, url: finalUrl, fallback, fallbackReason: fallback ? fallbackReason : undefined }
  } catch (error: any) {
    return { ok: false, error: error?.message || 'voice compose failed' }
  }
}
