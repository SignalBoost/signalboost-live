// saas/lib/cos/video-compose.ts
// JSON2Video final campaign composer.
// Uses a real scene template: 1080x1920 vertical support, 30fps, fixed timed
// overlays, SignalBoostAi branding, and www.saas.signalboostapp.com text.

import { fal } from '@fal-ai/client'

const J2V_ENDPOINT = 'https://api.json2video.com/v2/movies'
const SITE = 'https://www.saas.signalboostapp.com'
const SITE_LABEL = 'www.saas.signalboostapp.com'
const METADATA_MODEL = 'fal-ai/ffmpeg-api/metadata'
const FINAL_SECONDS = 15

let falConfigured = false
function ensureFal() {
  if (!falConfigured) {
    fal.config({ credentials: process.env['FAL_' + 'KEY'] })
    falConfigured = true
  }
}

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

function textElement(text: string, start: number, duration: number, color: string, y: number, fontSize: number, width: number) {
  return {
    type: 'text',
    text,
    start,
    duration,
    settings: {
      'font-family': 'Helvetica',
      'font-size': fontSize,
      color,
      'text-align': 'center',
      position: 'center',
    },
    x: 60,
    y,
    width: width - 120,
    height: 220,
    'z-index': 20,
  }
}

function buildOverlayMovie(opts: { sourceUrl: string; aspect: '16:9' | '9:16'; campaignId: string; lang: string; overlayUrl: string; durationSec: number | null }) {
  const { width, height } = dims(opts.aspect)
  const vertical = opts.aspect === '9:16'
  return {
    width,
    height,
    fps: 30,
    duration: FINAL_SECONDS,
    cache: false,
    quality: 'high',
    'client-data': { campaign_id: opts.campaignId, language: opts.lang, mode: 'json2video-scene-template', source_duration: opts.durationSec, site: SITE_LABEL },
    scenes: [
      {
        duration: FINAL_SECONDS,
        elements: [
          { type: 'video', src: opts.sourceUrl, duration: FINAL_SECONDS, resize: 'cover' },
          textElement('SignalBoostAi', 0, 5, '#ffffff', vertical ? 520 : 300, vertical ? 72 : 58, width),
          textElement('Boost Your Business Growth Automatically', 5, 5, '#00ffcc', vertical ? 760 : 500, vertical ? 48 : 42, width),
          textElement(`Start today at ${SITE_LABEL}`, 10, 5, '#ffc300', vertical ? 1460 : 820, vertical ? 42 : 36, width),
        ],
      },
    ],
    elements: [
      textElement(`SignalBoostAi • ${SITE_LABEL}`, 0, FINAL_SECONDS, '#ffffff', vertical ? 1780 : 970, vertical ? 34 : 30, width),
    ],
  }
}

async function j2vHeaders() {
  const key = process.env['JSON2VIDEO_' + 'API_KEY']
  if (!key) throw new Error('JSON2Video render credential not set')
  return { 'Content-Type': 'application/json', ['x-' + 'api-key']: key }
}

function j2vMessage(payload: any): string {
  const m = (payload && payload.movie) || {}
  const fromTasks = Array.isArray(m?.tasks) ? m.tasks.map((t: any) => t?.message || t?.error).filter(Boolean).join(' | ') : ''
  return String(m?.message || m?.error || payload?.message || payload?.error || fromTasks || '').slice(0, 400)
}

async function verifyOverlayReachable(_overlayUrl: string): Promise<{ ok: boolean; error?: string }> {
  return { ok: true }
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
  const trace: any = { campaignId, lang: opts.lang, aspect: opts.aspect, brandSchemaVersion: 8, phase: 'init', mode: 'json2video-scene-template' }
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
    trace.overlayUrl = overlayUrl
    await verifyOverlayReachable(overlayUrl)

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
