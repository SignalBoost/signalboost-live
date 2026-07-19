#!/usr/bin/env node
// Bounded COSA video finalizer.
//
// Produces one complete review artifact in a single FFmpeg pass:
// clean 720p visual + natural narration + solid-panel captions + brand banner.
// This avoids the previous two-pass 1080p voice/brand chain timing out before
// campaign metadata could advance beyond Step 2.

import { createClient } from '@supabase/supabase-js'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim()
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const bucket = String(process.env.COS_VIDEO_RENDER_BUCKET || 'video-renders').trim()
const elevenLabsKey = String(process.env.ELEVENLABS_API_KEY || '').trim()
const elevenLabsVoice = String(process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM').trim()
const elevenLabsModel = String(process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2').trim()
const maxCampaigns = Math.max(1, Math.min(2, Number(process.env.COS_VIDEO_FAST_FINAL_LIMIT || 2)))

if (!url || !key) throw new Error('Supabase URL and service-role key are required')
if (!bucket) throw new Error('COS_VIDEO_RENDER_BUCKET is required')

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const FINAL_SCHEMA = 'signalboost-fast-final-v1'
const BRAND_TEXT = 'SignalBoostAi · www.saas.signalboostapp.com'
const VOICES = { en: 'en-us', es: 'es', pt: 'pt-br', pl: 'pl', ru: 'ru' }

function errorText(error) {
  return error instanceof Error ? error.message : String(error || 'unknown error')
}

function run(command, args, { capture = false, timeoutMs = 240_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', capture ? 'pipe' : 'inherit', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`${command} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    if (child.stdout) child.stdout.on('data', chunk => { stdout += chunk.toString() })
    child.stderr.on('data', chunk => { stderr += chunk.toString() })
    child.on('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', code => {
      clearTimeout(timer)
      if (code === 0) resolve(stdout.trim())
      else reject(new Error(`${command} exited with ${code}: ${stderr.slice(-1800)}`))
    })
  })
}

function langOf(campaign) {
  const raw = Array.isArray(campaign?.languages) && campaign.languages.length ? String(campaign.languages[0]) : 'en'
  const lang = raw.toLowerCase().split(/[-_]/)[0]
  return Object.prototype.hasOwnProperty.call(VOICES, lang) ? lang : 'en'
}

function cleanText(value, max = 320) {
  return String(value || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function isInstruction(value) {
  const text = String(value || '').toLowerCase()
  if (!text) return true
  return /(do not repeat|don['’]t repeat|do not mention|instructions?|requirements?|prompt|voiceover|narration|captions?|subtitles?|scenes?|visual direction|aspect ratio|duration|on[- ]screen|camera|b[- ]roll|watermark|não repita|nao repita|instruções|requisitos|narração|legendas|cenas|texto na tela|duração|no repitas|instrucciones|narración|subtítulos|escenas|texto en pantalla|duración|nie powtarzaj|instrukcje|narracja|napisy|sceny|tekst na ekranie|не повторяй|инструкции|озвучка|субтитры|сцены|текст на экране)/i.test(text)
}

function safeSubject(campaign) {
  const title = cleanText(campaign?.title, 110)
  if (!title || isInstruction(title)) return ''
  return title.replace(/[.:;]+$/g, '')
}

function safeAudience(campaign, lang) {
  const audience = cleanText(campaign?.audience, 100)
  if (audience && !isInstruction(audience)) return audience
  if (lang === 'pt') return 'pequenas e médias empresas'
  if (lang === 'es') return 'pequeñas y medianas empresas'
  if (lang === 'pl') return 'małych i średnich firm'
  if (lang === 'ru') return 'малому и среднему бизнесу'
  return 'small and midsize businesses'
}

function storedScript(campaign) {
  const value = cleanText(campaign?.metadata?.campaign_script || campaign?.metadata?.campaignScript, 360)
  return value && !isInstruction(value) ? value : ''
}

function scriptFor(campaign) {
  const lang = langOf(campaign)
  const stored = storedScript(campaign)
  if (stored) return stored.slice(0, 360)

  const subject = safeSubject(campaign)
  const audience = safeAudience(campaign, lang)
  if (lang === 'pt') {
    return cleanText(`A SignalBoostAi ajuda ${audience} a gerar mais oportunidades com campanhas profissionais e fáceis de revisar. Organize sua mensagem, prepare os materiais e acompanhe os resultados em um só lugar. Comece grátis em saas.signalboostapp.com.`, 360)
  }
  if (lang === 'es') {
    return cleanText(`SignalBoostAi ayuda a ${audience} a generar más oportunidades con campañas profesionales y fáciles de revisar. Organiza el mensaje, prepara los recursos y controla los resultados en un solo lugar. Comienza gratis en saas.signalboostapp.com.`, 360)
  }
  if (lang === 'pl') {
    return cleanText(`SignalBoostAi pomaga ${audience} zdobywać więcej klientów dzięki profesjonalnym kampaniom, które łatwo sprawdzić. Przygotuj przekaz, materiały i wyniki w jednym miejscu. Zacznij bezpłatnie na saas.signalboostapp.com.`, 360)
  }
  if (lang === 'ru') {
    return cleanText(`SignalBoostAi помогает ${audience} получать больше клиентов с помощью профессиональных кампаний, которые легко проверить. Подготовьте сообщение, материалы и отслеживайте результаты в одном месте. Начните бесплатно на saas.signalboostapp.com.`, 360)
  }
  return cleanText(`SignalBoostAi helps ${audience} generate more opportunities with professional campaigns that are easy to review. Organize the message, prepare the assets, and track results in one place. Start free at saas.signalboostapp.com.`, 360)
}

function isMaintenance(campaign) {
  const title = String(campaign?.title || '').toLowerCase()
  return /(clear stuck|backup jobs?|maintenance|worker test|queue repair)/i.test(title)
}

async function narration(text, lang, dir) {
  if (elevenLabsKey) {
    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(elevenLabsVoice)}`, {
        method: 'POST',
        headers: { 'xi-api-key': elevenLabsKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({
          text,
          model_id: elevenLabsModel,
          voice_settings: { stability: 0.5, similarity_boost: 0.78 },
        }),
        signal: AbortSignal.timeout(90_000),
      })
      if (!response.ok) throw new Error(`ElevenLabs HTTP ${response.status}: ${(await response.text().catch(() => '')).slice(0, 220)}`)
      const bytes = Buffer.from(await response.arrayBuffer())
      if (!bytes.length) throw new Error('ElevenLabs returned empty audio')
      const path = join(dir, 'voice.mp3')
      await writeFile(path, bytes)
      return { path, engine: 'elevenlabs' }
    } catch (error) {
      console.error(`ElevenLabs unavailable; using local voice: ${errorText(error)}`)
    }
  }

  const textPath = join(dir, 'voice.txt')
  const audioPath = join(dir, 'voice.wav')
  await writeFile(textPath, text, 'utf8')
  await run('espeak-ng', ['-v', VOICES[lang] || VOICES.en, '-s', '155', '-p', '48', '-f', textPath, '-w', audioPath], { timeoutMs: 90_000 })
  return { path: audioPath, engine: 'espeak-ng-fallback' }
}

async function audioSeconds(path) {
  const output = await run('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', path,
  ], { capture: true, timeoutMs: 30_000 })
  return Math.max(1, Number(output) || 1)
}

function assTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0)
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = Math.floor(safe % 60)
  const cs = Math.floor((safe - Math.floor(safe)) * 100)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

function captionChunks(text, maxChars) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const chunks = []
  let current = ''
  for (const word of words) {
    const next = `${current} ${word}`.trim()
    if (next.length > maxChars && current) {
      chunks.push(current)
      current = word
    } else current = next
  }
  if (current) chunks.push(current)
  return chunks.slice(0, 10)
}

function buildAss(text, duration, vertical) {
  const width = vertical ? 720 : 1280
  const height = vertical ? 1280 : 720
  const fontSize = vertical ? 35 : 31
  const marginV = vertical ? 105 : 64
  const marginH = vertical ? 62 : 110
  const chunks = captionChunks(text, vertical ? 32 : 52)
  const segment = duration / Math.max(1, chunks.length)
  const events = chunks.map((caption, index) => {
    const start = index * segment
    const end = Math.min(duration, (index + 1) * segment + 0.12)
    const safe = caption.replace(/\\/g, '\\\\').replace(/[{}]/g, '')
    return `Dialogue: 0,${assTime(start)},${assTime(end)},Caption,,0,0,0,,${safe}`
  }).join('\n')

  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nScaledBorderAndShadow: yes\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Caption,DejaVu Sans,${fontSize},&H00FFFFFF,&H000000FF,&H00020617,&H00020617,1,0,0,0,100,100,0,0,1,3,0,2,${marginH},${marginH},${marginV},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events}\n`
}

function assPath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/'/g, "\\'")
}

async function processCampaign(campaign) {
  const lang = langOf(campaign)
  const script = scriptFor(campaign)
  const vertical = String(campaign?.channel || '') === 'short_video'
  const size = vertical ? '720x1280' : '1280x720'
  const dir = await mkdtemp(join(tmpdir(), 'signalboost-fast-final-'))
  const voicePath = join(dir, 'voice.mp3')
  const captionsPath = join(dir, 'captions.ass')
  const outputPath = join(dir, 'final.mp4')

  try {
    const voice = await narration(script, lang, dir)
    const spoken = await audioSeconds(voice.path)
    const duration = Math.max(10, Math.min(35, Math.ceil(spoken) + 1))
    await writeFile(captionsPath, buildAss(script, duration, vertical), 'utf8')

    const panelY = vertical ? 790 : 432
    const panelH = vertical ? 420 : 238
    const brandSize = vertical ? 38 : 34
    const urlSize = vertical ? 21 : 19
    const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
    const filter = [
      'format=yuv420p',
      `drawbox=x='mod(t*54,iw+320)-320':y=0:w=320:h=ih:color=0x12446d@0.34:t=fill`,
      `drawbox=x='iw-mod(t*39,iw+260)':y=0:w=260:h=ih:color=0x8a6900@0.18:t=fill`,
      'vignette=PI/5',
      `drawbox=x=0:y=0:w=iw:h=${vertical ? 145 : 116}:color=0x020617@0.92:t=fill`,
      `drawtext=fontfile=${font}:text='SignalBoostAi':fontcolor=0xffc300:fontsize=${brandSize}:x=(w-text_w)/2:y=${vertical ? 34 : 25}`,
      `drawtext=fontfile=${font}:text='www.saas.signalboostapp.com':fontcolor=white:fontsize=${urlSize}:x=(w-text_w)/2:y=${vertical ? 88 : 70}`,
      `drawbox=x=0:y=${panelY}:w=iw:h=${panelH}:color=0x020617@0.97:t=fill`,
      `ass='${assPath(captionsPath)}'`,
    ].join(',')

    await run('ffmpeg', [
      '-y', '-f', 'lavfi', '-i', `color=c=0x050b18:s=${size}:r=30:d=${duration}`,
      '-i', voice.path,
      '-vf', filter,
      '-map', '0:v:0', '-map', '1:a:0', '-t', String(duration),
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '24',
      '-c:a', 'aac', '-b:a', '128k', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      outputPath,
    ], { timeoutMs: 12 * 60 * 1000 })

    const bytes = await readFile(outputPath)
    const objectPath = `cos-final/${campaign.id}/${lang}-${Date.now()}.mp4`
    const upload = await sb.storage.from(bucket).upload(objectPath, bytes, { contentType: 'video/mp4', upsert: true })
    if (upload.error) throw new Error(`Final video upload failed: ${upload.error.message}`)
    const signed = await sb.storage.from(bucket).createSignedUrl(objectPath, 60 * 60 * 24 * 7)
    if (signed.error || !signed.data?.signedUrl) throw new Error(`Could not sign final video: ${signed.error?.message || 'missing signed URL'}`)

    const fresh = (await sb.from('cos_campaign_queue').select('*').eq('id', campaign.id).single()).data || campaign
    const video = fresh?.metadata?.video || {}
    const voiced = { ...(video.voiced || {}), [lang]: signed.data.signedUrl }
    const brandedLangs = { ...(video.brandedLangs || {}), [lang]: true }
    const unbrandedVoiced = { ...(video.unbrandedVoiced || {}) }
    delete unbrandedVoiced[lang]

    const patch = {
      ...video,
      status: 'ready',
      voiced,
      brandedLangs,
      unbrandedVoiced,
      voicedUrl: signed.data.signedUrl,
      finalUrl: signed.data.signedUrl,
      previewUrl: signed.data.signedUrl,
      previewKind: 'branded final',
      branded: true,
      brandSchemaVersion: FINAL_SCHEMA,
      brandText: BRAND_TEXT,
      brandedAt: new Date().toISOString(),
      brandingLock: null,
      brandingExhausted: false,
      voiceStatus: 'COMPLETED',
      voiceEngine: voice.engine,
      voiceFallback: voice.engine !== 'elevenlabs',
      voiceFallbackReason: voice.engine === 'elevenlabs' ? null : 'ElevenLabs was unavailable; a real local narration track was created.',
      voiceCompletedAt: new Date().toISOString(),
      captionsBurned: true,
      audioTrack: true,
      baseVisualSchemaVersion: 'signalboost-base-v3-fast-720p',
      captionSchemaVersion: 'signalboost-captions-v3-solid-panel',
      copySchemaVersion: 'signalboost-copy-v3-customer-only',
      finalSchemaVersion: FINAL_SCHEMA,
      voiceScriptSource: 'customer-facing-template-or-sanitized-campaign-script',
      voiceError: null,
      renderError: null,
      brandDebug: { mode: 'single-pass-fast-final', objectPath, lang, size, duration },
    }

    const update = await sb.from('cos_campaign_queue').update({ metadata: { ...(fresh.metadata || {}), video: patch } }).eq('id', campaign.id)
    if (update.error) throw update.error

    console.log(`COSA campaign ${campaign.id}: fast final complete (${lang}, ${voice.engine}, ${duration}s, ${size}).`)
    return { ok: true, id: campaign.id, lang, engine: voice.engine, duration, size }
  } catch (error) {
    const failure = errorText(error)
    console.error(`COSA campaign ${campaign.id}: fast final failed: ${failure}`)
    const fresh = (await sb.from('cos_campaign_queue').select('*').eq('id', campaign.id).single()).data || campaign
    const video = fresh?.metadata?.video || {}
    await sb.from('cos_campaign_queue').update({
      metadata: {
        ...(fresh.metadata || {}),
        video: {
          ...video,
          status: 'ready',
          branded: false,
          voicedUrl: null,
          finalUrl: null,
          previewUrl: video.url || null,
          previewKind: video.url ? 'base draft' : null,
          voiceStatus: 'FAILED',
          captionsBurned: false,
          audioTrack: false,
          voiceError: `fast final worker error: ${failure.slice(0, 500)}`,
          brandingLock: null,
        },
      },
    }).eq('id', campaign.id)
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
  if (video.status !== 'ready' || !video.url) return false
  return video.finalSchemaVersion !== FINAL_SCHEMA
}).slice(0, maxCampaigns)

console.log(`COSA fast final worker scanned=${campaigns?.length || 0} candidates=${candidates.length}`)
const results = []
for (const campaign of candidates) results.push(await processCampaign(campaign))
console.log(JSON.stringify({ ok: results.every(result => result.ok), processed: results.length, results }, null, 2))
