import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const queueDir = join(process.cwd(), '.video-queue')
const renderDir = join(process.cwd(), 'public', 'video-renders')
const pollMs = Number(process.env.VIDEO_WORKER_POLL_MS || 5000)
const once = process.argv.includes('--once')
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } }) : null

function safeFileName(name) { return String(name || 'video.mp4').replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 120) }
function assTime(seconds) { const safe = Math.max(0, Number(seconds) || 0); const h = Math.floor(safe / 3600); const m = Math.floor((safe % 3600) / 60); const s = Math.floor(safe % 60); const c = Math.floor((safe - Math.floor(safe)) * 100); return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}` }
function assColor(hex) { const match = String(hex || '').match(/^#?([a-f0-9]{6})$/i); if (!match) return '&H00FFFFFF'; const value = match[1]; return `&H00${value.slice(4, 6)}${value.slice(2, 4)}${value.slice(0, 2)}`.toUpperCase() }
function alignment(style) { if (style.y < 35) return style.x < 33 ? 7 : style.x > 66 ? 9 : 8; if (style.y > 65) return style.x < 33 ? 1 : style.x > 66 ? 3 : 2; return style.x < 33 ? 4 : style.x > 66 ? 6 : 5 }
function buildAss(payload) {
  const style = payload.style || {}
  const primary = assColor(style.color)
  const fontFamily = String(style.fontFamily || 'Arial').split(',')[0].replace(/[^a-zA-Z0-9 _-]/g, '') || 'Arial'
  const effect = style.animation === 'fade' ? '{\\fad(140,140)}' : style.animation === 'pop' ? '{\\t(0,160,\\fscx110\\fscy110)}' : style.animation === 'slide' ? '{\\move(960,980,960,880,0,180)}' : ''
  const cues = Array.isArray(payload.captions) ? payload.captions : []
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: SignalBoost,${fontFamily},${Number(style.fontSize) || 34},${primary},&H000000FF,&HAA000000,&HAA000000,1,0,0,0,100,100,0,0,3,2,0,${alignment(style)},64,64,${Math.max(16, Math.round((100 - (Number(style.y) || 78)) * 7))},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${cues.map((cue) => `Dialogue: 0,${assTime(cue.start)},${assTime(Math.max(Number(cue.end) || 0, (Number(cue.start) || 0) + 0.5))},SignalBoost,,0,0,0,,${effect}${String(cue.text || '').replace(/[{}]/g, '')}`).join('\n')}\n`
}
function runFfmpeg(args) { return new Promise((resolve, reject) => { const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] }); let stderr = ''; child.stderr.on('data', (chunk) => { stderr += chunk.toString() }); child.on('error', reject); child.on('close', (code) => code === 0 ? resolve() : reject(new Error(stderr || `ffmpeg exited with ${code}`))) }) }
async function renderCaptionBurnJob(jobId, payload) {
  await mkdir(renderDir, { recursive: true })
  const sourcePath = String(payload.sourceUrl || '').startsWith('/video-storage/') ? join(process.cwd(), 'public', payload.sourceUrl) : payload.sourceUrl
  if (!existsSync(sourcePath)) throw new Error(`Source video not found: ${payload.sourceUrl}`)
  const assPath = join(renderDir, `${jobId}.ass`)
  const outputName = `${jobId}-${safeFileName(payload.filename).replace(/\.[^.]+$/, '')}.mp4`
  const outputPath = join(renderDir, outputName)
  await writeFile(assPath, buildAss(payload), 'utf8')
  await runFfmpeg(['-y', '-i', sourcePath, '-vf', `ass=${assPath}`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-movflags', '+faststart', outputPath])
  return { resultUrl: `/video-renders/${outputName}`, outputPath }
}
async function updateJob(id, patch) { if (supabase) await supabase.from('video_jobs').update(patch).eq('id', id); await writeFile(join(queueDir, `${id}.result.json`), JSON.stringify({ id, ...patch }, null, 2), 'utf8') }
async function processLocalFile(file) { const id = file.replace(/\.json$/, ''); const payloadPath = join(queueDir, file); const processingPath = join(queueDir, `${id}.processing.json`); await rename(payloadPath, processingPath); await updateJob(id, { status: 'processing' }); try { const payload = JSON.parse(await readFile(processingPath, 'utf8')); const result = await renderCaptionBurnJob(id, payload); await updateJob(id, { status: 'completed', result_url: result.resultUrl, result_path: result.outputPath, completed_at: new Date().toISOString() }); await rename(processingPath, join(queueDir, `${id}.done.json`)) } catch (error) { await updateJob(id, { status: 'failed', error: error instanceof Error ? error.message : String(error) }); await rename(processingPath, join(queueDir, `${id}.failed.json`)) } }
async function processSupabaseJob() { if (!supabase) return false; const { data } = await supabase.from('video_jobs').select('*').eq('status', 'queued').in('job_type', ['caption_burn', 'export']).order('created_at', { ascending: true }).limit(1).maybeSingle(); if (!data) return false; await supabase.from('video_jobs').update({ status: 'processing' }).eq('id', data.id); try { const result = await renderCaptionBurnJob(data.id, data.queue_payload); await supabase.from('video_jobs').update({ status: 'completed', result_url: result.resultUrl, result_path: result.outputPath, completed_at: new Date().toISOString() }).eq('id', data.id) } catch (error) { await supabase.from('video_jobs').update({ status: 'failed', error: error instanceof Error ? error.message : String(error) }).eq('id', data.id) } return true }
async function tick() { await mkdir(queueDir, { recursive: true }); const processedRemote = await processSupabaseJob(); if (processedRemote) return; const files = existsSync(queueDir) ? (await readdir(queueDir)).filter((file) => file.endsWith('.json') && !file.endsWith('.result.json')).sort() : []; if (files[0]) await processLocalFile(files[0]) }
console.log(`SignalBoost video render worker started (queue=${queueDir}, once=${once})`)
do { await tick(); if (!once) await new Promise((resolve) => setTimeout(resolve, pollMs)) } while (!once)
