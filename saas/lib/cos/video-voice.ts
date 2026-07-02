// saas/lib/cos/video-voice.ts
// Adds a real spoken voiceover to a campaign's rendered video and creates
// captions from the same script text sent to TTS.

import { fal } from '@fal-ai/client'
import { generateSpeech } from '@/lib/elevenlabs/client'

const COMPOSE_MODEL = 'fal-ai/ffmpeg-api/compose'
const METADATA_MODEL = 'fal-ai/ffmpeg-api/metadata'
const SUBTITLE_MODEL = 'veed/subtitles'
const BRAND_NAME = 'SignalBoostAi'
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

let falConfigured = false
function ensureFal() {
  if (!falConfigured) { fal.config({ credentials: process.env.FAL_KEY }); falConfigured = true }
}

function hasSiteUrl(text: string): boolean {
  return new RegExp(SITE_URL.replace(/\./g, '\\.'), 'i').test(String(text || ''))
}

function hasBrand(text: string): boolean {
  return new RegExp(BRAND_NAME, 'i').test(String(text || ''))
}

function normalizeBrandText(text: string): string {
  let out = String(text || '')
  out = out.replace(/\bsignal\s*boost\s*\.?(?:ai|a\.i\.)\b/gi, BRAND_NAME)
  out = out.replace(/\bsignalboostai\b/gi, BRAND_NAME)
  out = out.replace(/\bsignalboost\s+ai\b/gi, BRAND_NAME)
  out = out.replace(new RegExp(`(${BRAND_NAME})(?:\\s*\\1)+`, 'gi'), '$1')
  return out
}

function normalizeUrlText(text: string): string {
  let out = String(text || '')
  out = out.replace(/(?:https?:\/\/)?(?:www\.)*(?:saas\.)?signal\s*boost\s*a?p{1,3}\.com(?:\/[^\s,.!?)]*)?/gi, SITE_URL)
  out = out.replace(/(?:https?:\/\/)?(?:www\.)*(?:saas\.)?signalboosta?p{1,3}\.com(?:\/[^\s,.!?)]*)?/gi, SITE_URL)
  out = out.replace(/(?:https?:\/\/)?(?:www\.)*signalboost\.com(?:\/[^\s,.!?)]*)?/gi, SITE_URL)
  out = out.replace(/(?:www\.)+www\./gi, 'www.')
  out = out.replace(new RegExp(`(${SITE_URL.replace(/\./g, '\\.')})(?:\\s*\\1)+`, 'gi'), '$1')
  return out
}

function normalizeMarketingText(text: string): string {
  return normalizeBrandText(normalizeUrlText(String(text || '')))
    .replace(/\s+/g, ' ')
    .trim()
}

function ensureBrandAndUrl(text: string): string {
  let out = normalizeMarketingText(text)
  const needsBrand = !hasBrand(out)
  const needsUrl = !hasSiteUrl(out)

  if (needsBrand && needsUrl) {
    out = `${out} Powered by ${BRAND_NAME}. Visit ${SITE_URL}.`
  } else if (needsBrand) {
    out = `${out} Powered by ${BRAND_NAME}.`
  } else if (needsUrl) {
    out = `${out} Visit ${SITE_URL}.`
  }

  return normalizeMarketingText(out)
}

function narrationFor(campaign: any, lang: string): string {
  const items = Array.isArray(campaign.work_items) ? campaign.work_items : []
  const match =
    items.find((it: any) => it?.input?.language === lang && it?.output) ||
    items.find((it: any) => it?.output)
  const o = (match && match.output) || {}
  const parts = [o.title, o.opening, o.draft, o.call_to_action]
    .map((v: any) => normalizeMarketingText(String(v || '')))
    .filter(Boolean)
  let text = parts.join('. ').replace(/\.\s*\.+/g, '.').replace(/\s+/g, ' ').trim()
  if (!text) {
    const t = normalizeMarketingText(String(campaign.title || BRAND_NAME)) || BRAND_NAME
    text = `${t}. ${BRAND_NAME} helps companies grow faster with AI-built websites, branded content, outreach campaigns, and growth tools. Automate your marketing, launch new campaigns in minutes, reach more customers across every channel, and scale with confidence. See how it works and get started today.`
  }
  text = ensureBrandAndUrl(text)
  if (text.length > 760) {
    text = text.slice(0, 760)
    const cut = Math.max(text.lastIndexOf('. '), text.lastIndexOf('! '), text.lastIndexOf('? '))
    if (cut > 380) text = text.slice(0, cut + 1)
  }
  return ensureBrandAndUrl(text)
}

function estimateMs(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length
  return Math.round((words / 2.5) * 1000 * 1.15)
}

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
    const lineMs = Math.max(500, Math.round((lineWordCount / totalWords) * totalMs))
    const startMs = cursorMs
    const endMs = Math.min(totalMs, cursorMs + lineMs)
    if (endMs <= startMs) break
    blocks.push(`${idx}\n${formatSrtTime(startMs)} --> ${formatSrtTime(endMs)}\n${line}\n`)
    cursorMs = endMs
    idx += 1
    if (cursorMs >= totalMs) break
  }
  return blocks.join('\n')
}

function pickFalVideoUrl(result: any): string {
  return String(
    result?.data?.video_url ||
    result?.data?.video?.url ||
    result?.data?.url ||
    result?.video_url ||
    result?.video?.url ||
    ''
  )
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

    let audio: ArrayBuffer
    try {
      audio = await generateSpeech({ text, voiceId })
    } catch (e: any) {
      return { ok: false, error: `TTS failed: ${e?.message || 'unknown'}` }
    }
    const audioDataUri = `data:audio/mpeg;base64,${Buffer.from(audio).toString('base64')}`

    ensureFal()

    const fallbackMs = Math.min(Math.max(estimateMs(text), MIN_TOTAL_MS), MAX_TOTAL_MS)
    const audioMs = await probeAudioMs(audioDataUri, fallbackMs)
    const totalMs = Math.min(Math.max(Math.ceil(audioMs), MIN_TOTAL_MS), MAX_TOTAL_MS)

    const tracks = [
      { id: 'video', type: 'video', keyframes: buildVideoKeyframes(String(videoUrl), totalMs) },
      { id: 'voice', type: 'audio', keyframes: [{ timestamp: 0, duration: totalMs, url: audioDataUri }] },
    ]
    const result: any = await fal.subscribe(COMPOSE_MODEL, { input: { tracks } })
    let finalUrl = pickFalVideoUrl(result)
    if (!finalUrl) return { ok: false, error: 'compose returned no video url' }

    try {
      const srt = buildSrt(text, totalMs)
      if (srt) {
        const cap: any = await fal.subscribe(SUBTITLE_MODEL, {
          input: { video_url: finalUrl, srt_text: srt, preset: 'simple' },
        })
        const capUrl = pickFalVideoUrl(cap)
        if (capUrl) finalUrl = String(capUrl)
      }
    } catch {}

    return { ok: true, url: finalUrl }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'voice compose failed' }
  }
}
