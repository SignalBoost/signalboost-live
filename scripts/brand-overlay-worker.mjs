// scripts/brand-overlay-worker.mjs
// FFmpeg brand-overlay worker, run by GitHub Actions (free compute, real FFmpeg).
// Replaces the JSON2Video overlay step at $0 per video.
//
// DIAGNOSTICS: every failure path emits a GitHub Actions annotation
// (::error::/::notice::) so the exact reason appears in the Annotations box on
// the run summary page — no log-digging needed to know what went wrong.
//
// Flow per eligible campaign+language:
//   1. Take the voiced+captioned video the Vercel cron already produced.
//   2. Fetch the brand overlay PNG from the live site (/api/brand-overlay).
//   3. FFmpeg: scale to canvas, composite the PNG on top.
//   4. Upload branded MP4 to Supabase Storage (public bucket, auto-created).
//   5. Update cos_campaign_queue metadata in the exact shape the Vercel cron
//      writes, so dashboard/publish gates/measurement work unchanged.
//
// Requires GitHub Actions secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { execFileSync } from 'node:child_process'
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '')
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const SITE = 'https://www.saas.signalboostapp.com'
const BUCKET = 'cos-videos'
const BACKLOG_CUTOFF = process.env.COS_BRAND_SINCE || '2026-07-02T12:00:00Z'
const LOCK_MS = 5 * 60 * 1000
const MAX_GH_ATTEMPTS = 5
const BRAND_SCHEMA_VERSION = 7
const BRAND_TEXT = { name: 'SignalBoostAi', url: 'www.saas.signalboostapp.com' }

// GitHub Actions annotations — these surface in the run summary "Annotations" box.
const oneLine = (s) => String(s).replace(/\r?\n/g, ' | ').slice(0, 400)
const annotateError = (msg) => console.log(`::error::${oneLine(msg)}`)
const annotateNotice = (msg) => console.log(`::notice::${oneLine(msg)}`)

annotateNotice(
  `Config check — SUPABASE_URL set: ${Boolean(SUPABASE_URL)} (${SUPABASE_URL ? SUPABASE_URL.slice(0, 30) + '...' : 'EMPTY'}), ` +
  `SERVICE_ROLE_KEY set: ${Boolean(SERVICE_KEY)} (length ${SERVICE_KEY.length})`
)

if (!SUPABASE_URL || !SERVICE_KEY) {
  annotateError('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add both under repo Settings → Secrets and variables → Actions, names exactly as shown, then Run workflow again.')
  process.exit(1)
}
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL)) {
  annotateError(`SUPABASE_URL looks malformed: "${SUPABASE_URL}". Expected the bare project URL like https://abcdefgh.supabase.co (Supabase → Settings → API → Project URL), no quotes, no trailing path.`)
  process.exit(1)
}

const sbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }

async function rest(path, opts = {}) {
  return fetch(`${SUPABASE_URL}${path}`, { ...opts, headers: { ...sbHeaders, ...(opts.headers || {}) } })
}

async function ensureBucket() {
  const res = await rest('/storage/v1/bucket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  })
  if (res.ok) { console.log(`Created public bucket "${BUCKET}".`); return }
  const body = await res.text()
  if (res.status === 409 || /already exists|duplicate/i.test(body)) return
  if (res.status === 401 || res.status === 403) {
    throw new Error(`Storage auth rejected (${res.status}). The key in SUPABASE_SERVICE_ROLE_KEY is probably the anon key — copy the service_role key instead (Supabase → Settings → API). Response: ${body.slice(0, 150)}`)
  }
  throw new Error(`Bucket check failed (${res.status}): ${body.slice(0, 200)}`)
}

async function fetchCandidates() {
  const res = await rest(`/rest/v1/cos_campaign_queue?select=*&created_at=gte.${encodeURIComponent(BACKLOG_CUTOFF)}&order=created_at.desc&limit=20`)
  if (!res.ok) {
    const body = await res.text()
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Database auth rejected (${res.status}). The key in SUPABASE_SERVICE_ROLE_KEY is probably the anon key — copy the service_role key instead. Response: ${body.slice(0, 150)}`)
    }
    throw new Error(`Candidate fetch failed: ${res.status} ${body.slice(0, 200)}`)
  }
  return res.json()
}

async function patchVideoMeta(campaign, videoPatch) {
  const metadata = { ...(campaign.metadata || {}), video: videoPatch }
  const res = await rest(`/rest/v1/cos_campaign_queue?id=eq.${campaign.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ metadata }),
  })
  if (!res.ok) throw new Error(`DB update failed: ${res.status} ${(await res.text()).slice(0, 200)}`)
}

async function download(url, path) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`)
  writeFileSync(path, Buffer.from(await res.arrayBuffer()))
}

function runFfmpeg(srcPath, overlayPath, outPath, aspect) {
  const [w, h] = aspect === '9:16' ? [1080, 1920] : [1920, 1080]
  execFileSync('ffmpeg', [
    '-y',
    '-i', srcPath,
    '-i', overlayPath,
    '-filter_complex',
    `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}[base];[base][1:v]overlay=0:0:format=auto`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    outPath,
  ], { stdio: 'inherit' })
}

async function uploadToStorage(localPath, storagePath) {
  const bytes = readFileSync(localPath)
  const res = await rest(`/storage/v1/object/${BUCKET}/${storagePath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'video/mp4', 'x-upsert': 'true' },
    body: bytes,
  })
  if (!res.ok) throw new Error(`Storage upload failed: ${res.status} ${(await res.text()).slice(0, 200)}`)
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`
}

function pickJob(campaign) {
  const v = (campaign.metadata && campaign.metadata.video) || {}
  if (v.status !== 'ready' || !v.url) return null
  if (v.brandingExhausted === true) return null
  const lock = v.brandingLock
  if (lock && lock.at && Date.now() - Date.parse(lock.at) < LOCK_MS) return null

  const langs = Array.isArray(campaign.languages) && campaign.languages.length ? campaign.languages : ['en']
  const brandedLangs = v.brandedLangs || {}
  const unbranded = v.unbrandedVoiced || {}
  const gh = v.ghOverlayAttempts || {}

  for (const lang of langs) {
    if (brandedLangs[lang]) continue
    if ((gh[lang] || 0) >= MAX_GH_ATTEMPTS) continue
    const source = unbranded[lang] || (lang === langs[0] ? (v.unbrandedVoicedUrl || v.voicedUrl) : null)
    if (!source) continue
    return { lang, source: String(source), primary: langs[0], v, langs }
  }
  return null
}

async function processCampaign(campaign) {
  const job = pickJob(campaign)
  if (!job) return 'skipped'
  const { lang, source, primary, v } = job
  console.log(`\n=== Campaign ${campaign.id} [${lang}] ===`)
  console.log(`source: ${source}`)

  await patchVideoMeta(campaign, { ...v, brandingLock: { lang, at: new Date().toISOString(), by: 'github-actions' } })

  const aspect = v.aspect === '9:16' || v.aspect === '16:9' ? v.aspect : campaign.channel === 'short_video' ? '9:16' : '16:9'
  mkdirSync('/tmp/work', { recursive: true })
  const srcPath = '/tmp/work/source.mp4'
  const overlayPath = '/tmp/work/overlay.png'
  const outPath = '/tmp/work/branded.mp4'

  try {
    await download(source, srcPath)
    await download(`${SITE}/api/brand-overlay?a=${aspect === '9:16' ? '9x16' : '16x9'}`, overlayPath)
    runFfmpeg(srcPath, overlayPath, outPath, aspect)
    const publicUrl = await uploadToStorage(outPath, `${campaign.id}/${lang}-${Date.now()}.mp4`)
    console.log(`branded: ${publicUrl}`)

    const brandedLangs = { ...(v.brandedLangs || {}), [lang]: true }
    const voiced = { ...(v.voiced || {}), [lang]: publicUrl }
    const unbrandedVoiced = { ...(v.unbrandedVoiced || {}) }
    delete unbrandedVoiced[lang]
    const isPrimary = lang === primary

    await patchVideoMeta(campaign, {
      ...v,
      status: 'ready',
      voiced,
      voicedUrl: isPrimary ? publicUrl : (v.voicedUrl || publicUrl),
      branded: Boolean(brandedLangs[primary]),
      brandedLangs,
      unbrandedVoiced,
      brandSchemaVersion: brandedLangs[primary] ? BRAND_SCHEMA_VERSION : v.brandSchemaVersion || null,
      brandText: brandedLangs[primary] ? BRAND_TEXT : v.brandText || null,
      brandingLock: null,
      voiceError: null,
      brandedAt: brandedLangs[primary] ? (v.brandedAt || new Date().toISOString()) : v.brandedAt || null,
      brandDebug: { mode: 'github-actions-ffmpeg', at: new Date().toISOString() },
    })
    return 'branded'
  } catch (e) {
    const gh = { ...(v.ghOverlayAttempts || {}), [lang]: ((v.ghOverlayAttempts || {})[lang] || 0) + 1 }
    annotateError(`Campaign ${campaign.id} [${lang}] failed: ${e.message}`)
    await patchVideoMeta(campaign, {
      ...v,
      ghOverlayAttempts: gh,
      brandingLock: null,
      voiceError: `ffmpeg overlay error: [${lang}] ${String(e.message).slice(0, 250)} (gh attempt ${gh[lang]}/${MAX_GH_ATTEMPTS})`,
    })
    return 'failed'
  }
}

async function main() {
  await ensureBucket()
  const campaigns = await fetchCandidates()
  console.log(`Scanning ${campaigns.length} recent campaigns (cutoff ${BACKLOG_CUTOFF})...`)
  let branded = 0, failed = 0, skipped = 0
  for (const c of campaigns) {
    const r = await processCampaign(c)
    if (r === 'branded') branded++
    else if (r === 'failed') failed++
    else skipped++
  }
  annotateNotice(`Result: branded=${branded} failed=${failed} skipped=${skipped} of ${campaigns.length} scanned`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => { annotateError(`Worker crashed: ${e.message}`); console.error(e); process.exit(1) })
