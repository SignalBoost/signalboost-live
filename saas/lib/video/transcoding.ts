import { mkdtemp, mkdir, rm, writeFile, stat, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, extname, basename } from 'node:path'
import { spawn } from 'node:child_process'

export type SubscriptionTier = 'free' | 'pro' | 'enterprise'
export type TranscodeStatus = 'pending' | 'processing' | 'ready' | 'failed'

export type VideoUsageSnapshot = {
  accountId: string
  subscriptionTier: SubscriptionTier
  quotaMb: number
  usedMb: number
  overageMb: number
  overageCharges: number
  extraChargeRequired: boolean
  playbackMode: 'demo' | 'full' | 'overage_billable'
  demoSeconds: number
}

export type UniversalVideoAsset = {
  id: string
  originalFilename: string
  originalExtension: string
  originalSizeMb: number
  transcodedFilename: string
  transcodedFormat: 'mp4'
  transcodedSizeMb: number
  status: TranscodeStatus
  mp4Key: string
  hlsManifestKey: string
  hlsSegmentKeys: string[]
  demoTrimmed: boolean
  usage: VideoUsageSnapshot
}

export const VIDEO_BUCKET = 'video-jobs'
export const DEFAULT_FREE_DEMO_SECONDS = 45
export const OVERAGE_RATE_PER_GB = 3.5
export const PLAN_QUOTA_MB: Record<SubscriptionTier, number> = {
  free: 250,
  pro: 25 * 1024,
  enterprise: 250 * 1024,
}

export function normalizeSubscriptionTier(value: unknown): SubscriptionTier {
  const tier = String(value ?? '').toLowerCase()
  if (tier === 'enterprise' || tier === 'business') return 'enterprise'
  if (tier === 'pro' || tier === 'starter' || tier === 'paid') return 'pro'
  return 'free'
}

export function getOriginalExtension(filename: string): string {
  const ext = extname(filename).replace(/^\./, '').toLowerCase()
  return ext || 'unknown'
}

export function safeBaseName(filename: string): string {
  return basename(filename, extname(filename))
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'video'
}

export function bytesToRoundedMb(bytes: number): number {
  return Math.max(1, Math.ceil(bytes / (1024 * 1024)))
}

export function createUsageSnapshot(input: {
  accountId: string
  subscriptionTier: SubscriptionTier
  quotaMb?: number | null
  usedMb?: number | null
  uploadMb: number
  demoSeconds?: number
}): VideoUsageSnapshot {
  const quotaMb = Number.isFinite(Number(input.quotaMb)) && Number(input.quotaMb) > 0
    ? Math.round(Number(input.quotaMb))
    : PLAN_QUOTA_MB[input.subscriptionTier]
  const usedMbBefore = Math.max(0, Math.round(Number(input.usedMb ?? 0)))
  const usedMb = usedMbBefore + Math.max(0, input.uploadMb)
  const overageMb = Math.max(0, usedMb - quotaMb)
  const overageCharges = Number(((overageMb / 1024) * OVERAGE_RATE_PER_GB).toFixed(2))
  const extraChargeRequired = input.subscriptionTier !== 'free' && overageMb > 0
  return {
    accountId: input.accountId,
    subscriptionTier: input.subscriptionTier,
    quotaMb,
    usedMb,
    overageMb,
    overageCharges,
    extraChargeRequired,
    playbackMode: input.subscriptionTier === 'free' ? 'demo' : extraChargeRequired ? 'overage_billable' : 'full',
    demoSeconds: input.demoSeconds ?? DEFAULT_FREE_DEMO_SECONDS,
  }
}

export async function transcodeWithFfmpeg(input: {
  file: File
  jobId: string
  subscriptionTier: SubscriptionTier
  demoSeconds?: number
}): Promise<{
  workDir: string
  originalPath: string
  mp4Path: string
  hlsManifestPath: string
  hlsDir: string
  hlsSegmentPaths: string[]
  transcodedSizeMb: number
  transcodedFilename: string
}> {
  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg'
  const ffprobe = process.env.FFPROBE_PATH || 'ffprobe'
  const workDir = await mkdtemp(join(tmpdir(), 'signalboost-video-'))
  const originalPath = join(workDir, input.file.name.replace(/[/\\]/g, '-'))
  const mp4Path = join(workDir, `${safeBaseName(input.file.name)}-${input.jobId}.mp4`)
  const hlsDir = join(workDir, 'hls')
  const hlsManifestPath = join(hlsDir, 'index.m3u8')
  await mkdir(hlsDir, { recursive: true })
  await writeFile(originalPath, Buffer.from(await input.file.arrayBuffer()))

  const canProbe = await commandSucceeds(ffprobe, ['-v', 'error', '-show_format', '-show_streams', originalPath])
  if (!canProbe) {
    await cleanupWorkDir(workDir)
    throw new Error('FFmpeg could not read the uploaded media. Confirm the file is a valid video or audio asset.')
  }

  const trimArgs = input.subscriptionTier === 'free'
    ? ['-t', String(input.demoSeconds ?? DEFAULT_FREE_DEMO_SECONDS)]
    : []

  await runCommand(ffmpeg, [
    '-y',
    '-i', originalPath,
    ...trimArgs,
    '-map', '0:v:0?',
    '-map', '0:a:0?',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-profile:v', 'high',
    '-level', '4.1',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '48000',
    '-ac', '2',
    mp4Path,
  ])

  await runCommand(ffmpeg, [
    '-y',
    '-i', mp4Path,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-profile:v', 'main',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-hls_time', '6',
    '-hls_playlist_type', 'vod',
    '-hls_segment_filename', join(hlsDir, 'segment-%03d.ts'),
    hlsManifestPath,
  ])

  const hlsFiles = await readdir(hlsDir)
  const hlsSegmentPaths = hlsFiles
    .filter((file) => file.endsWith('.ts'))
    .sort()
    .map((file) => join(hlsDir, file))
  const mp4Stats = await stat(mp4Path)

  return {
    workDir,
    originalPath,
    mp4Path,
    hlsManifestPath,
    hlsDir,
    hlsSegmentPaths,
    transcodedSizeMb: bytesToRoundedMb(mp4Stats.size),
    transcodedFilename: basename(mp4Path),
  }
}

export async function readAsset(path: string): Promise<Buffer> {
  return readFile(path)
}

export async function cleanupWorkDir(workDir: string) {
  await rm(workDir, { recursive: true, force: true })
}

function commandSucceeds(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
  })
}

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
      if (stderr.length > 8000) stderr = stderr.slice(-8000)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`FFmpeg failed with exit code ${code}: ${stderr.trim()}`))
    })
  })
}
