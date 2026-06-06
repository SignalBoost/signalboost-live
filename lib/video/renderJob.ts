import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import type { CaptionStyle, VideoExportPayload } from '@/lib/video/types'
import { captionsToAssDialogue } from '@/lib/video/captions'
import { safeFileName, videoRenderDir } from '@/lib/video/storage'

function assTime(seconds: number) {
  const safe = Math.max(0, seconds)
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const secs = Math.floor(safe % 60)
  const centis = Math.floor((safe - Math.floor(safe)) * 100)
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`
}

function assColor(hex: string) {
  const match = hex.match(/^#?([a-f0-9]{6})$/i)
  if (!match) return '&H00FFFFFF'
  const value = match[1]
  return `&H00${value.slice(4, 6)}${value.slice(2, 4)}${value.slice(0, 2)}`.toUpperCase()
}

function alignmentFromStyle(style: CaptionStyle) {
  if (style.y < 35) return style.x < 33 ? 7 : style.x > 66 ? 9 : 8
  if (style.y > 65) return style.x < 33 ? 1 : style.x > 66 ? 3 : 2
  return style.x < 33 ? 4 : style.x > 66 ? 6 : 5
}

export function buildAssSubtitles(payload: VideoExportPayload) {
  const style = payload.style
  const dialogues = captionsToAssDialogue(payload.captions)
  const primary = assColor(style.color)
  const fontFamily = style.fontFamily.split(',')[0].replace(/[^a-zA-Z0-9 _-]/g, '') || 'Arial'
  const alignment = alignmentFromStyle(style)
  const marginV = Math.max(16, Math.round((100 - style.y) * 7))
  const effect = style.animation === 'fade' ? '{\\fad(140,140)}' : style.animation === 'pop' ? '{\\t(0,160,\\fscx110\\fscy110)}' : style.animation === 'slide' ? '{\\move(960,980,960,880,0,180)}' : ''

  return `[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: SignalBoost,${fontFamily},${style.fontSize},${primary},&H000000FF,&HAA000000,&HAA000000,1,0,0,0,100,100,0,0,3,2,0,${alignment},64,64,${marginV},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${dialogues.map((cue) => `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},SignalBoost,,0,0,0,,${effect}${cue.text}`).join('\n')}\n`
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr || `ffmpeg exited with ${code}`))
    })
  })
}

export async function renderCaptionBurnJob(jobId: string, payload: VideoExportPayload) {
  await mkdir(videoRenderDir, { recursive: true })
  const sourcePath = payload.sourceUrl.startsWith('/video-storage/')
    ? join(process.cwd(), 'public', payload.sourceUrl)
    : payload.sourceUrl
  if (!existsSync(sourcePath)) throw new Error(`Source video not found: ${payload.sourceUrl}`)

  const assPath = join(videoRenderDir, `${jobId}.ass`)
  const outputName = `${jobId}-${safeFileName(payload.filename).replace(/\.[^.]+$/, '')}.mp4`
  const outputPath = join(videoRenderDir, outputName)
  await writeFile(assPath, buildAssSubtitles(payload), 'utf8')
  await runFfmpeg(['-y', '-i', sourcePath, '-vf', `ass=${assPath}`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-movflags', '+faststart', outputPath])
  return { resultUrl: `/video-renders/${outputName}`, outputPath }
}

export async function readJobPayload(pathOrJson: string) {
  if (pathOrJson.trim().startsWith('{')) return JSON.parse(pathOrJson) as VideoExportPayload
  return JSON.parse(await readFile(pathOrJson, 'utf8')) as VideoExportPayload
}
