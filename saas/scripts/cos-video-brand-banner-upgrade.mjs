#!/usr/bin/env node
// Upgrade completed COSA videos to a prominent full-width brand banner.
//
// The finalizer already burns SignalBoostAi and the URL into the video, but its
// compact header can look like a small card on vertical video. This idempotent
// pass covers that header with a larger, dedicated top band while preserving
// narration and captions.

import { createClient } from '@supabase/supabase-js'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim()
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const bucket = String(process.env.COS_VIDEO_RENDER_BUCKET || 'video-renders').trim()
const limit = Math.max(1, Math.min(3, Number(process.env.COS_VIDEO_BANNER_UPGRADE_LIMIT || 2)))

if (!url || !key) throw new Error('Supabase URL and service-role key are required')
if (!bucket) throw new Error('COS_VIDEO_RENDER_BUCKET is required')

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const BANNER_SCHEMA = 'signalboost-brand-banner-v2-prominent-full-width'

function errorText(error) {
  return error instanceof Error ? error.message : String(error || 'unknown error')
}

function run(command, args, timeoutMs = 10 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'pipe'] })
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`${command} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    child.stderr.on('data', chunk => { stderr += chunk.toString() })
    child.on('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', code => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with ${code}: ${stderr.slice(-1800)}`))
    })
  })
}

function isMaintenance(campaign) {
  return /(clear stuck|backup jobs?|maintenance|worker test|queue repair)/i.test(String(campaign?.title || ''))
}

function sourceUrl(campaign) {
  const video = campaign?.metadata?.video || {}
  return String(video.finalUrl || video.previewUrl || video.voicedUrl || '').trim()
}

async function download(source, destination) {
  const response = await fetch(source, { cache: 'no-store', signal: AbortSignal.timeout(90_000) })
  if (!response.ok) throw new Error(`Could not download final video: HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (!bytes.length) throw new Error('Downloaded final video is empty')
  await writeFile(destination, bytes)
}

async function upgrade(campaign) {
  const vertical = String(campaign?.channel || '') === 'short_video'
  const dir = await mkdtemp(join(tmpdir(), 'signalboost-banner-upgrade-'))
  const input = join(dir, 'input.mp4')
  const output = join(dir, 'output.mp4')

  try {
    await download(sourceUrl(campaign), input)

    const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
    const bandHeight = vertical ? 236 : 156
    const brandSize = vertical ? 68 : 54
    const urlSize = vertical ? 32 : 27
    const brandY = vertical ? 42 : 27
    const urlY = vertical ? 132 : 91
    const dividerY = bandHeight - 7

    const filter = [
      `drawbox=x=0:y=0:w=iw:h=${bandHeight}:color=0x020617@0.985:t=fill`,
      `drawbox=x=0:y=${dividerY}:w=iw:h=7:color=0xffc300@0.95:t=fill`,
      `drawtext=fontfile=${font}:text='SignalBoostAi':fontcolor=0xffc300:fontsize=${brandSize}:x=(w-text_w)/2:y=${brandY}`,
      `drawtext=fontfile=${font}:text='www.saas.signalboostapp.com':fontcolor=white:fontsize=${urlSize}:x=(w-text_w)/2:y=${urlY}`,
    ].join(',')

    await run('ffmpeg', [
      '-y', '-i', input,
      '-vf', filter,
      '-map', '0:v:0', '-map', '0:a?',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '21',
      '-c:a', 'aac', '-b:a', '128k',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      output,
    ])

    const bytes = await readFile(output)
    const lang = Array.isArray(campaign?.languages) && campaign.languages.length
      ? String(campaign.languages[0]).toLowerCase().split(/[-_]/)[0]
      : 'en'
    const objectPath = `cos-final/${campaign.id}/${lang}-prominent-banner-${Date.now()}.mp4`
    const uploaded = await sb.storage.from(bucket).upload(objectPath, bytes, { contentType: 'video/mp4', upsert: true })
    if (uploaded.error) throw new Error(`Banner-upgraded video upload failed: ${uploaded.error.message}`)
    const signed = await sb.storage.from(bucket).createSignedUrl(objectPath, 60 * 60 * 24 * 7)
    if (signed.error || !signed.data?.signedUrl) throw new Error(`Could not sign upgraded video: ${signed.error?.message || 'missing signed URL'}`)

    const fresh = (await sb.from('cos_campaign_queue').select('*').eq('id', campaign.id).single()).data || campaign
    const metadata = fresh?.metadata || {}
    const video = metadata?.video || {}
    const primary = Array.isArray(fresh?.languages) && fresh.languages.length ? String(fresh.languages[0]).toLowerCase().split(/[-_]/)[0] : lang
    const voiced = { ...(video.voiced || {}), [primary]: signed.data.signedUrl }

    const patch = {
      ...video,
      status: 'ready',
      voiced,
      voicedUrl: signed.data.signedUrl,
      finalUrl: signed.data.signedUrl,
      previewUrl: signed.data.signedUrl,
      previewKind: 'branded final',
      branded: true,
      brandBannerSchemaVersion: BANNER_SCHEMA,
      brandBannerLayout: 'prominent-full-width-top-band',
      brandBannerHeight: bandHeight,
      brandBannerUpgradedAt: new Date().toISOString(),
      brandDebug: {
        ...(video.brandDebug || {}),
        prominentBanner: true,
        bannerSchema: BANNER_SCHEMA,
        objectPath,
      },
    }

    const update = await sb.from('cos_campaign_queue').update({ metadata: { ...metadata, video: patch } }).eq('id', campaign.id)
    if (update.error) throw update.error

    console.log(`COSA campaign ${campaign.id}: prominent full-width brand banner applied.`)
    return { ok: true, id: campaign.id }
  } catch (error) {
    const failure = errorText(error)
    console.error(`COSA campaign ${campaign.id}: brand banner upgrade failed: ${failure}`)
    return { ok: false, id: campaign.id, error: failure }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const { data: campaigns, error } = await sb
  .from('cos_campaign_queue')
  .select('*')
  .in('channel', ['youtube', 'short_video'])
  .neq('status', 'rejected')
  .order('created_at', { ascending: false })
  .limit(50)

if (error) throw new Error(error.message)

const candidates = (campaigns || []).filter(campaign => {
  if (campaign?.approved_at || isMaintenance(campaign)) return false
  const video = campaign?.metadata?.video || {}
  if (video.status !== 'ready' || video.branded !== true || !sourceUrl(campaign)) return false
  return video.brandBannerSchemaVersion !== BANNER_SCHEMA
}).slice(0, limit)

console.log(`COSA brand banner upgrade scanned=${campaigns?.length || 0} candidates=${candidates.length}`)
const results = []
for (const campaign of candidates) results.push(await upgrade(campaign))
console.log(JSON.stringify({ ok: results.every(result => result.ok), processed: results.length, results }, null, 2))
