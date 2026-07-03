// scripts/brand-overlay-worker.mjs
// FFmpeg brand-overlay worker (GitHub Actions, free compute, real FFmpeg).
//
// SELF-REPORTING: every run emits one annotation per scanned campaign stating
// its exact state (status, branded flags, attempts, lock, which URL it serves)
// and the precise skip/brand/fail decision — visible on the run summary page,
// machine-readable from outside. Nobody has to copy logs anywhere.

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

const oneLine = (s) => String(s).replace(/\r?\n/g, ' | ').slice(0, 480)
const annotateError = (msg) => console.log(`::error::${oneLine(msg)}`)
const annotateNotice = (msg) => console.log(`::notice::${oneLine(msg)}`)
const urlTail = (u) => { const s = String(u || ''); return s ? '…' + s.slice(-46) : 'none' }

annotateNotice(
  `Config check — SUPABASE_URL set: ${Boolean(SUPABASE_URL)} (${SUPABASE_URL ? SUPABASE_URL.slice(0, 30) + '...' : 'EMPTY'}), ` +
  `SERVICE_ROLE_KEY set: ${Boolean(SERVICE_KEY)} (length ${SERVICE_KEY.length})`
)

if (!SUPABASE_URL || !SERVICE_KEY) {
  annotateError('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add both under repo Settings → Secrets and variables → Actions, then Run workflow again.')
  process.exit(1)
}
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL)) {
  annotateError(`SUPABASE_URL looks malformed: "${SUPABASE_URL}". Expected e.g. https://abcdefgh.supabase.co`)
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
  if (res.ok) return
  const body = await res.text()
  if (res.status === 409 || /already exists|duplicate/i.test(body)) return
  if (res.status === 401 || res.status === 403) throw new Error(`Storage auth rejected (${res.status}) — SUPABASE_SERVICE_ROLE_KEY is probably the anon key. ${body.slice(0, 120)}`)
  throw new Error(`Bucket check failed (${res.status}): ${body.slice(0, 200)}`)
}

async function fetchCandidates() {
  const res = await rest(`/rest/v1/cos_campaign_queue?select=*&created_at=gte.${encodeURIComponent(BACKLOG_CUTOFF)}&order=created_at.desc&limit=20`)
  if (!res.ok) {
    const body = await res.text()
    if (res.status === 401 || res.status === 403) throw new Error(`Database auth rejected (${res.status}) — wrong key? ${body.slice(0, 120)}`)
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
    `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}[base];[1:v]scale=${w}:${h}[ovr];[base][ovr]overlay=0:0:format=auto`,
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

// Returns { job } or { skip: 'reason' } — the reason gets annotated verbatim.
function pickJob(campaign) {
  const v = (campaign.metadata && campaign.metadata.video) || {}
  if (!v.url) return { skip: 'no rendered video (metadata.video.url empty)' }
  if (v.status !== 'ready') return { skip: `video status is "${v.status}", not ready` }
  if (v.brandingExhausted === true) return { skip: 'brandingExhausted flag set' }
  const lock = v.brandingLock
  if (lock && lock.at && Date.now() - Date.parse(lock.at) < LOCK_MS) return { skip: `brandingLock held by ${lock.by || 'vercel'} since ${lock.at}` }

  const langs = Array.isArray(campaign.languages) && campaign.languages.length ? campaign.languages : ['en']
  const brandedLangs = v.brandedLangs || {}
  const unbranded = v.unbrandedVoiced || {}
  const gh = v.ghOverlayAttempts || {}

  for (const lang of langs) {
    if (brandedLangs[lang]) continue
    if ((gh[lang] || 0) >= MAX_GH_ATTEMPTS) continue
    const source = unbranded[lang] || (lang === langs[0] ? (v.unbrandedVoicedUrl || v.voicedUrl) : null)
    if (!source) continue
    return { job: { lang, source: String(source), primary: langs[0], v, langs } }
  }

  // Explain why no language qualified.
  const parts = langs.map((l) => {
    if (brandedLangs[l]) return `${l}:already-branded`
    if ((gh[l] || 0) >= MAX_GH_ATTEMPTS) return `${l}:gh-attempts-exhausted(${gh[l]})`
    return `${l}:no-voiced-source-yet`
  })
  return { skip: `no eligible language [${parts.join(', ')}]` }
}

function describe(campaign) {
  const v = (campaign.metadata && campaign.metadata.video) || {}
  return `status=${v.status || 'none'} branded=${v.branded === true} brandedLangs=${JSON.stringify(v.brandedLangs || {})} ` +
    `voicedUrl=${urlTail(v.voicedUrl)} unbranded=${JSON.stringify(Object.keys(v.unbrandedVoiced || {}))} ` +
    `ghAttempts=${JSON.stringify(v.ghOverlayAttempts || {})} lock=${v.brandingLock ? 'HELD' : 'no'} err=${v.voiceError ? String(v.voiceError).slice(0, 80) : 'none'}`
}

async function processCampaign(campaign) {
  const title = String(campaign.title || '').slice(0, 40)
  const picked = pickJob(campaign)
  if (picked.skip) {
    annotateNotice(`SKIP ${campaign.id.slice(0, 8)} "${title}" — ${picked.skip} | ${describe(campaign)}`)
    return 'skipped'
  }
  const { lang, source, primary, v } = picked.job
  console.log(`\n=== Campaign ${campaign.id} [${lang}] ===\nsource: ${source}`)

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
    annotateNotice(`BRANDED ${campaign.id.slice(0, 8)} "${title}" [${lang}] aspect=${aspect} → ${urlTail(publicUrl)}`)
    return 'branded'
  } catch (e) {
    const gh = { ...(v.ghOverlayAttempts || {}), [lang]: ((v.ghOverlayAttempts || {})[lang] || 0) + 1 }
    annotateError(`FAILED ${campaign.id.slice(0, 8)} "${title}" [${lang}]: ${e.message}`)
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
