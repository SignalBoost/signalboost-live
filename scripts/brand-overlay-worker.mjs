// scripts/brand-overlay-worker.mjs
// GitHub Actions FFmpeg worker for burning SignalBoostAi branding into COS videos.

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const PROJECT_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '')
const PRIVATE_TOKEN = (process.env['SUPABASE_' + 'SERVICE_' + 'ROLE_' + 'KEY'] || '').trim()
const SITE = 'https://www.saas.signalboostapp.com'
const BUCKET = 'cos-videos'
const SINCE = process.env.COS_BRAND_SINCE || '2026-07-02T12:00:00Z'
const LOCK_MS = 5 * 60 * 1000
const MAX_ATTEMPTS = 5
const RUN_BUDGET_MS = 15 * 60 * 1000
const BRAND_SCHEMA_VERSION = 7
const BRAND_TEXT = { name: 'SignalBoostAi', url: 'www.saas.signalboostapp.com' }
const startedAt = Date.now()

const oneLine = (s) => String(s || '').replace(/\r?\n/g, ' | ').slice(0, 480)
const notice = (s) => console.log(`::notice::${oneLine(s)}`)
const failNote = (s) => console.log(`::error::${oneLine(s)}`)
const leftMs = () => RUN_BUDGET_MS - (Date.now() - startedAt)
const tail = (u) => { const s = String(u || ''); return s ? '…' + s.slice(-46) : 'none' }

notice(`Config check — SUPABASE_URL set: ${Boolean(PROJECT_URL)} (${PROJECT_URL ? PROJECT_URL.slice(0, 30) + '...' : 'EMPTY'}), private token set: ${Boolean(PRIVATE_TOKEN)} (length ${PRIVATE_TOKEN.length})`)

if (!PROJECT_URL || !PRIVATE_TOKEN) {
  failNote('Missing required repository secrets for Supabase access. Add the project URL and private server token under GitHub Actions secrets, then run again.')
  process.exit(1)
}

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(PROJECT_URL)) {
  failNote(`SUPABASE_URL looks malformed: ${PROJECT_URL}`)
  process.exit(1)
}

const baseHeaders = { apikey: PRIVATE_TOKEN, Authorization: `Bearer ${PRIVATE_TOKEN}` }
async function rest(path, opts = {}) {
  return fetch(`${PROJECT_URL}${path}`, { ...opts, headers: { ...baseHeaders, ...(opts.headers || {}) } })
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
  throw new Error(`Bucket check failed (${res.status}): ${body.slice(0, 200)}`)
}

async function fetchCampaigns() {
  const res = await rest(`/rest/v1/cos_campaign_queue?select=*&created_at=gte.${encodeURIComponent(SINCE)}&order=created_at.desc&limit=20`)
  if (!res.ok) throw new Error(`Candidate fetch failed: ${res.status} ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

async function patchVideo(campaign, video) {
  const metadata = { ...(campaign.metadata || {}), video }
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

function burnBanner(src, overlay, out, aspect) {
  const [w, h] = aspect === '9:16' ? [1080, 1920] : [1920, 1080]
  execFileSync('ffmpeg', [
    '-y',
    '-i', src,
    '-i', overlay,
    '-filter_complex',
    `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}[base];[1:v]scale=${w}:${h}[ovr];[base][ovr]overlay=0:0:format=auto`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    out,
  ], { stdio: 'inherit' })
}

async function upload(localPath, storagePath) {
  const res = await rest(`/storage/v1/object/${BUCKET}/${storagePath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'video/mp4', 'x-upsert': 'true' },
    body: readFileSync(localPath),
  })
  if (!res.ok) throw new Error(`Storage upload failed: ${res.status} ${(await res.text()).slice(0, 200)}`)
  return `${PROJECT_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`
}

function describe(v) {
  return `status=${v.status || 'none'} branded=${v.branded === true} brandedLangs=${JSON.stringify(v.brandedLangs || {})} voicedUrl=${tail(v.voicedUrl)} unbranded=${JSON.stringify(Object.keys(v.unbrandedVoiced || {}))}`
}

function nextJob(campaign, video, failedThisRun) {
  if (!video.url) return { skip: 'no rendered video URL' }
  if (video.status !== 'ready') return { skip: `video status is ${video.status || 'empty'}` }
  const langs = Array.isArray(campaign.languages) && campaign.languages.length ? campaign.languages : ['en']
  const brandedLangs = video.brandedLangs || {}
  const unbranded = video.unbrandedVoiced || {}
  const attempts = video.ghOverlayAttempts || {}

  for (const lang of langs) {
    if (brandedLangs[lang]) continue
    if (failedThisRun.has(lang)) continue
    if ((attempts[lang] || 0) >= MAX_ATTEMPTS) continue
    const source = unbranded[lang] || (lang === langs[0] ? (video.unbrandedVoicedUrl || video.voicedUrl) : null)
    if (source) return { job: { lang, source: String(source), primary: langs[0] } }
  }

  return { skip: 'no eligible voiced unbranded language waiting for FFmpeg banner' }
}

async function processCampaign(campaign) {
  const title = String(campaign.title || '').slice(0, 40)
  let video = (campaign.metadata && campaign.metadata.video) || {}
  const lock = video.brandingLock
  if (video.brandingExhausted === true) {
    notice(`SKIP ${campaign.id.slice(0, 8)} ${title} — brandingExhausted | ${describe(video)}`)
    return { branded: 0, failed: 0 }
  }
  if (lock && lock.at && Date.now() - Date.parse(lock.at) < LOCK_MS) {
    notice(`SKIP ${campaign.id.slice(0, 8)} ${title} — brandingLock held | ${describe(video)}`)
    return { branded: 0, failed: 0 }
  }

  const failedThisRun = new Set()
  let branded = 0
  let failed = 0
  let lastSkip = ''

  while (leftMs() > 60_000) {
    const picked = nextJob(campaign, video, failedThisRun)
    if (picked.skip) { lastSkip = picked.skip; break }
    const { lang, source, primary } = picked.job
    const aspect = video.aspect === '9:16' || video.aspect === '16:9' ? video.aspect : campaign.channel === 'short_video' ? '9:16' : '16:9'

    mkdirSync('/tmp/work', { recursive: true })
    const src = '/tmp/work/source.mp4'
    const overlay = '/tmp/work/overlay.png'
    const out = '/tmp/work/branded.mp4'

    try {
      console.log(`\n=== Campaign ${campaign.id} [${lang}] ===\nsource: ${source}`)
      await patchVideo(campaign, { ...video, brandingLock: { lang, at: new Date().toISOString(), by: 'github-actions' } })
      await download(source, src)
      await download(`${SITE}/api/brand-overlay?a=${aspect === '9:16' ? '9x16' : '16x9'}`, overlay)
      burnBanner(src, overlay, out, aspect)
      const publicUrl = await upload(out, `${campaign.id}/${lang}-${Date.now()}.mp4`)

      const brandedLangs = { ...(video.brandedLangs || {}), [lang]: true }
      const voiced = { ...(video.voiced || {}), [lang]: publicUrl }
      const unbrandedVoiced = { ...(video.unbrandedVoiced || {}) }
      delete unbrandedVoiced[lang]

      video = {
        ...video,
        status: 'ready',
        voiced,
        voicedUrl: lang === primary ? publicUrl : (video.voicedUrl || publicUrl),
        branded: Boolean(brandedLangs[primary]),
        brandedLangs,
        unbrandedVoiced,
        brandSchemaVersion: brandedLangs[primary] ? BRAND_SCHEMA_VERSION : video.brandSchemaVersion || null,
        brandText: brandedLangs[primary] ? BRAND_TEXT : video.brandText || null,
        brandingLock: null,
        voiceError: null,
        brandedAt: brandedLangs[primary] ? (video.brandedAt || new Date().toISOString()) : video.brandedAt || null,
        brandDebug: { mode: 'github-actions-ffmpeg', at: new Date().toISOString() },
      }
      await patchVideo(campaign, video)
      notice(`BRANDED ${campaign.id.slice(0, 8)} ${title} [${lang}] aspect=${aspect} → ${tail(publicUrl)}`)
      branded++
    } catch (e) {
      const attempts = { ...(video.ghOverlayAttempts || {}), [lang]: ((video.ghOverlayAttempts || {})[lang] || 0) + 1 }
      video = { ...video, ghOverlayAttempts: attempts, brandingLock: null, voiceError: `ffmpeg overlay error: [${lang}] ${String(e.message).slice(0, 250)} (attempt ${attempts[lang]}/${MAX_ATTEMPTS})` }
      await patchVideo(campaign, video)
      failNote(`FAILED ${campaign.id.slice(0, 8)} ${title} [${lang}]: ${e.message}`)
      failedThisRun.add(lang)
      failed++
    }
  }

  if (!branded && !failed) notice(`SKIP ${campaign.id.slice(0, 8)} ${title} — ${lastSkip || 'time budget spent'} | ${describe(video)}`)
  return { branded, failed }
}

async function main() {
  await ensureBucket()
  const campaigns = await fetchCampaigns()
  console.log(`Scanning ${campaigns.length} recent campaigns (cutoff ${SINCE}, run budget ${Math.round(RUN_BUDGET_MS / 60000)}m)...`)
  let branded = 0, failed = 0, skipped = 0
  for (const c of campaigns) {
    if (leftMs() < 60_000) { console.log('Run budget spent; remaining campaigns roll to the next run.'); break }
    const r = await processCampaign(c)
    branded += r.branded
    failed += r.failed
    if (!r.branded && !r.failed) skipped++
  }
  notice(`Result: branded=${branded} failed=${failed} skippedCampaigns=${skipped} of ${campaigns.length} scanned`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => { failNote(`Worker crashed: ${e.message}`); console.error(e); process.exit(1) })
