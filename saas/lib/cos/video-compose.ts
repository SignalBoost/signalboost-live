// saas/lib/cos/video-compose.ts
// JSON2Video is used only for the pixel brand overlay. The existing media path
// still creates narration/captions first (video-voice.ts), then this module
// burns in the exact SignalBoostAi name + URL overlay on top of that.
//
// FIX: JSON2Video's `duration: -1` asks IT to probe the source video's
// intrinsic length itself. That probe can fail on a freshly-generated fal.media
// CDN source (encoding quirk, timing, redirect), producing a vague "error
// rendering scenes" with no further detail. We already have proven, working
// code elsewhere in this pipeline (fal-ai/ffmpeg-api/metadata) for reliably
// reading a video's real duration — so we probe it ourselves and hand
// JSON2Video an explicit, known number instead of asking it to guess.

import { fal } from '@fal-ai/client'

const J2V_ENDPOINT = 'https://api.json2video.com/v2/movies'
const SITE = 'https://www.saas.signalboostapp.com'
const METADATA_MODEL = 'fal-ai/ffmpeg-api/metadata'

let falConfigured = false
function ensureFal() {
  if (!falConfigured) { fal.config({ credentials: process.env.FAL_KEY }); falConfigured = true }
}

// Probe the real duration of the source video ourselves (in seconds), rather
// than letting JSON2Video's own intrinsic-length detection be the single
// point of failure. Falls back to null (caller uses -1 auto-detect) if the
// probe itself fails, so this degrades gracefully instead of blocking.
async function probeDurationSeconds(url: string): Promise<number | null> {
  try {
    ensureFal()
    const r: any = await fal.subscribe(METADATA_MODEL, { input: { media_url: url } })
    const d = r?.data || {}
    const sec =
      d?.media?.duration ??
      d?.duration ??
      d?.video?.duration ??
      (Array.isArray(d?.streams) ? d.streams.find((s: any) => s?.duration)?.duration : undefined)
    const n = Number(sec)
    if (Number.isFinite(n) && n > 0.5) return n
  } catch {}
  return null
}

function dims(aspect: '16:9' | '9:16') {
  const vertical = aspect === '9:16'
  return { width: vertical ? 1080 : 1920, height: vertical ? 1920 : 1080 }
}

function buildOverlayMovie(opts: { sourceUrl: string; aspect: '16:9' | '9:16'; campaignId: string; lang: string; overlayUrl: string; durationSec: number | null }) {
  const { width, height } = dims(opts.aspect)
  // Prefer an explicit, known duration (from our own probe) over JSON2Video's
  // own auto-detection (-1), which is the likely source of "rendering scenes"
  // failures on a freshly-generated source file.
  const videoDuration = opts.durationSec && opts.durationSec > 0 ? opts.durationSec : -1
  const sceneDuration = opts.durationSec && opts.durationSec > 0 ? opts.durationSec : -1
  return {
    width,
    height,
    quality: 'high',
    'client-data': { campaign_id: opts.campaignId, language: opts.lang, mode: 'brand-overlay-only' },
    scenes: [{ duration: sceneDuration, elements: [{ type: 'video', src: opts.sourceUrl, duration: videoDuration, resize: 'cover' }] }],
    elements: [{ type: 'image', src: opts.overlayUrl, duration: -2, x: 0, y: 0, width, height, 'z-index': 99 }],
  }
}

async function j2vHeaders() {
  const key = process.env.JSON2VIDEO_API_KEY
  if (!key) throw new Error('JSON2VIDEO_API_KEY not set')
  return { 'Content-Type': 'application/json', 'x-api-key': key }
}

function j2vMessage(payload: any): string {
  const m = (payload && payload.movie) || {}
  const fromTasks = Array.isArray(m?.tasks) ? m.tasks.map((t: any) => t?.message || t?.error).filter(Boolean).join(' | ') : ''
  return String(m?.message || m?.error || payload?.message || payload?.error || fromTasks || '').slice(0, 400)
}

async function verifyOverlayReachable(overlayUrl: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(overlayUrl, { redirect: 'follow' })
    if (!res.ok) return { ok: false, error: `brand overlay URL returned ${res.status}` }
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('image')) return { ok: false, error: `brand overlay URL did not return an image (content-type: ${contentType || 'unknown'})` }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: `brand overlay URL unreachable: ${e?.message || 'fetch failed'}` }
  }
}

async function submitAndPoll(movie: any, trace: any): Promise<{ ok: boolean; url?: string; error?: string; debug?: any }> {
  const headers = await j2vHeaders()
  trace.phase = 'submit'
  const submitRes = await fetch(J2V_ENDPOINT, { method: 'POST', headers, body: JSON.stringify(movie) })
  const submitData: any = await submitRes.json().catch(() => ({}))
  trace.submitHttp = submitRes.status
  if (!submitRes.ok || submitData?.success === false) {
    const msg = j2vMessage(submitData) || `submit failed (${submitRes.status})`
    trace.phase = 'submit-rejected'
    trace.error = msg
    return { ok: false, error: `submit ${submitRes.status}: ${msg}`, debug: trace }
  }
  const project = submitData?.project || submitData?.movie?.project || submitData?.id
  if (!project) {
    trace.phase = 'no-project'
    return { ok: false, error: 'No project id returned from JSON2Video.', debug: trace }
  }
  trace.project = String(project)
  trace.phase = 'poll'
  let lastStatus = ''
  let lastMessage = ''
  const deadline = Date.now() + 240_000
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 8000))
    const pollRes = await fetch(`${J2V_ENDPOINT}?project=${encodeURIComponent(String(project))}`, { headers })
    const pollData: any = await pollRes.json().catch(() => ({}))
    const m = pollData?.movie || {}
    const status = String(m?.status || '')
    if (status) lastStatus = status
    const msg = j2vMessage(pollData)
    if (msg) lastMessage = msg
    if (status === 'done' && m?.url) {
      trace.phase = 'done'
      trace.status = status
      return { ok: true, url: String(m.url), debug: trace }
    }
    if (status === 'error' || m?.success === false || pollData?.success === false) {
      const em = msg || 'render error'
      trace.phase = 'render-error'
      trace.status = status
      trace.error = em
      return { ok: false, error: `render error [${trace.project}]: ${em}`, debug: trace }
    }
  }
  trace.phase = 'timeout'
  trace.status = lastStatus
  trace.error = lastMessage
  return { ok: false, error: `render timed out after 240s [${trace.project}, last status: ${lastStatus || 'unknown'}${lastMessage ? `, ${lastMessage}` : ''}]`, debug: trace }
}

export async function renderBrandOverlayVideo(opts: { campaign: any; sourceUrl: string; aspect: '16:9' | '9:16'; lang: string }): Promise<{ ok: boolean; url?: string; error?: string; debug?: any }> {
  const campaignId = String(opts.campaign?.id || '')
  const trace: any = { campaignId, lang: opts.lang, aspect: opts.aspect, brandSchemaVersion: 7, phase: 'init', mode: 'brand-overlay-only' }
  const log = () => { try { console.log('[branded-video]', JSON.stringify(trace)) } catch {} }
  try {
    if (!opts.sourceUrl) {
      trace.phase = 'no-source'
      log()
      return { ok: false, error: 'No source video URL to brand.', debug: trace }
    }

    trace.phase = 'probe-duration'
    const durationSec = await probeDurationSeconds(opts.sourceUrl)
    trace.probedDurationSec = durationSec

    const overlayUrl = `${SITE}/api/brand-overlay?a=${opts.aspect === '9:16' ? '9x16' : '16x9'}`
    trace.phase = 'verify-overlay'
    trace.overlayUrl = overlayUrl
    const overlayCheck = await verifyOverlayReachable(overlayUrl)
    if (!overlayCheck.ok) {
      trace.phase = 'overlay-unreachable'
      trace.error = overlayCheck.error
      log()
      return { ok: false, error: overlayCheck.error, debug: trace }
    }
    const movie = buildOverlayMovie({ sourceUrl: opts.sourceUrl, aspect: opts.aspect, campaignId, lang: opts.lang, overlayUrl, durationSec })
    const result = await submitAndPoll(movie, trace)
    log()
    return result
  } catch (e: any) {
    trace.phase = 'exception'
    trace.error = e?.message || 'branded overlay failed'
    log()
    return { ok: false, error: e?.message || 'branded overlay failed', debug: trace }
  }
}
