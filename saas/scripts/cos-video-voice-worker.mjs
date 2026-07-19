#!/usr/bin/env node
// COSA Step 2 worker: create a real narration track and burned-in captions.
//
// Quality rules:
// 1. Owner/production instructions must never become spoken campaign copy.
// 2. Captions must remain readable over every base visual.
// 3. A final video is not voice-complete without a verified audio track,
//    burned captions, and the current caption/copy schema versions.

import { createClient } from '@supabase/supabase-js'
import { createWriteStream } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim()
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const renderBucket = String(process.env.COS_VIDEO_RENDER_BUCKET || 'video-renders').trim()
const elevenLabsKey = String(process.env.ELEVENLABS_API_KEY || '').trim()
const elevenLabsVoice = String(process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM').trim()
const elevenLabsModel = String(process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2').trim()
const maxCampaigns = Math.max(1, Math.min(5, Number(process.env.COS_VIDEO_MAX_VOICE_PER_RUN || 3)))

const CAPTION_SCHEMA_VERSION = 'signalboost-captions-v2-solid-panel'
const COPY_SCHEMA_VERSION = 'signalboost-campaign-copy-v2-clean'

if (!url || !key) throw new Error('Supabase URL and service-role key are required')
if (!renderBucket) throw new Error('COS_VIDEO_RENDER_BUCKET is required')

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const VOICES = {
  en: 'en-us',
  es: 'es',
  pt: 'pt-br',
  pl: 'pl',
  ru: 'ru',
}

const FALLBACK_COPY = {
  en: 'SignalBoostAi helps small businesses turn ideas into professional marketing campaigns faster. Build your campaign, review every asset, and stay in control before anything is published.',
  es: 'SignalBoostAi ayuda a las pequeñas empresas a convertir ideas en campañas profesionales con mayor rapidez. Crea tu campaña, revisa cada recurso y mantén el control antes de publicar.',
  pt: 'A SignalBoostAi ajuda pequenas empresas a transformar ideias em campanhas profissionais com mais rapidez. Crie sua campanha, revise cada material e mantenha o controle antes da publicação.',
  pl: 'SignalBoostAi pomaga małym firmom szybciej zamieniać pomysły w profesjonalne kampanie. Utwórz kampanię, sprawdź każdy materiał i zachowaj kontrolę przed publikacją.',
  ru: 'SignalBoostAi помогает малому бизнесу быстрее превращать идеи в профессиональные кампании. Создайте кампанию, проверьте каждый материал и сохраняйте контроль до публикации.',
}

function errText(error) {
  return error instanceof Error ? error.message : String(error || 'unknown error')
}

function clean(value, max = 900) {
  return String(value || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[\t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
    .slice(0, max)
}

function langOf(campaign) {
  const raw = Array.isArray(campaign?.languages) && campaign.languages.length
    ? String(campaign.languages[0])
    : 'en'
  const short = raw.toLowerCase().split(/[-_]/)[0]
  return Object.prototype.hasOwnProperty.call(VOICES, short) ? short : 'en'
}

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0400-\u04ff]+/g, ' ')
    .trim()
}

function productionInstruction(fragment) {
  const value = String(fragment || '').trim()
  if (!value) return true
  const lower = value.toLowerCase()

  const explicitLeak = /(do not repeat|don['’]t repeat|must not repeat|not be repeated|do not mention|don['’]t mention|do not say|ignore previous|system prompt|user prompt|these instructions|the instructions|não repita|nao repita|não repetir|nao repetir|não mencione|nao mencione|não diga|nao diga|estas instruções|essas instruções|sin repetir|no repitas|no repetir|no menciones|no digas|estas instrucciones|nie powtarzaj|nie wspominaj|nie mów|tych instrukcji|не повторяй|не упоминай|не говори|эти инструкции)/i
  if (explicitLeak.test(lower)) return true

  const fieldLabel = /^(instructions?|requirements?|prompt|system|assistant|voiceover|narration|captions?|subtitles?|scenes?|visuals?|format|duration|aspect ratio|tone|style|language|target audience|audience|cta|hook|instruções|requisitos|narração|legendas|cenas|formato|duração|idioma|público[- ]alvo|instrucciones|requisitos|narración|subtítulos|escenas|formato|duración|idioma|público objetivo|instrukcje|wymagania|narracja|napisy|sceny|format|czas trwania|język|grupa docelowa|инструкции|требования|озвучка|субтитры|сцены|формат|длительность|язык|аудитория)\s*[:\-–—]/i
  if (fieldLabel.test(value)) return true

  const metaVocabulary = /(prompt|instruction|requirement|assistant|the ai|this ai|voiceover|narration|caption|subtitle|on[- ]screen|screen text|scene|shot|camera|b[- ]roll|watermark|aspect ratio|duration|render|production|visual direction|logo placement|narração|legenda|texto na tela|cena|filmagem|câmera|duração|renderização|produção|direção visual|narración|subtítulo|texto en pantalla|escena|cámara|duración|producción|narracja|napisy|tekst na ekranie|scena|kamera|czas trwania|produkcja|озвучка|субтитры|текст на экране|сцена|камера|длительность|производство)/i
  const directive = /^(please\s+)?(must|should|do not|don['’]t|never|use|show|include|add|create|make|generate|write|say|mention|avoid|keep|ensure|please|não|nao|use|mostre|inclua|adicione|crie|gere|escreva|diga|evite|mantenha|garanta|no|usa|muestra|incluye|añade|crea|genera|escribe|di|evita|mantén|asegura|nie|użyj|pokaz|dodaj|utwórz|wygeneruj|napisz|powiedz|unikaj|zachowaj|upewnij|не|используй|покажи|добавь|создай|сгенерируй|напиши|скажи|избегай|сохрани|убедись)\b/i
  if (metaVocabulary.test(value) && directive.test(value)) return true

  const aiDirective = /(ai|assistant|model|cosa).{0,40}(must|should|do not|don['’]t|repeat|mention|say|include|use|não|nao|deve|repita|mencione|diga|no debe|repita|mencione|diga|powinien|nie może|powtarzaj|wspominaj|mów|должен|не должен|повторять|упоминать|говорить)/i
  if (aiDirective.test(value)) return true

  return false
}

function sanitizeCampaignCopy(value, max = 900) {
  const source = clean(value, 4000)
  if (!source) return ''

  const fragments = source
    .replace(/[•▪◦]/g, '\n')
    .split(/\n+|(?<=[.!?])\s+|\s*;\s+/)
    .map((part) => part.replace(/^[-–—*#\d.)\s]+/, '').trim())
    .filter(Boolean)

  const kept = []
  const seen = new Set()
  for (let fragment of fragments) {
    fragment = fragment
      .replace(/^(script|copy|campaign copy|mensagem|texto|guion|scenariusz|текст)\s*[:\-–—]\s*/i, '')
      .replace(/\[[^\]]*(instruction|caption|subtitle|scene|prompt|instru|legenda|subtítulo|napisy|инструк)[^\]]*\]/gi, '')
      .trim()

    if (!fragment || productionInstruction(fragment)) continue
    const key = normalizeKey(fragment)
    if (!key || seen.has(key)) continue
    seen.add(key)
    kept.push(fragment)
  }

  return clean(kept.join(' '), max)
}

function scriptFrom(campaign) {
  const lang = langOf(campaign)
  const candidates = []

  const stored = sanitizeCampaignCopy(campaign?.metadata?.campaign_script || campaign?.metadata?.campaignScript || '', 900)
  if (stored) candidates.push(stored)

  const workItems = Array.isArray(campaign?.work_items) ? campaign.work_items : []
  for (const item of workItems) {
    const output = item?.output || {}
    for (const value of [output.voiceover, output.script, output.draft, output.body, output.opening, output.call_to_action]) {
      const text = sanitizeCampaignCopy(value, 900)
      if (text) candidates.push(text)
    }
  }

  const objective = sanitizeCampaignCopy(campaign?.objective, 360)
  const title = sanitizeCampaignCopy(campaign?.title, 180)
  const audience = sanitizeCampaignCopy(campaign?.audience, 180)
  if (!candidates.length) {
    if (title) candidates.push(title)
    if (objective && normalizeKey(objective) !== normalizeKey(title)) candidates.push(objective)
    if (audience) {
      const audienceLead = lang === 'pt' ? `Feita para ${audience}.`
        : lang === 'es' ? `Creada para ${audience}.`
          : lang === 'pl' ? `Stworzona dla: ${audience}.`
            : lang === 'ru' ? `Создано для: ${audience}.`
              : `Built for ${audience}.`
      candidates.push(audienceLead)
    }
  }

  const sentences = []
  const seen = new Set()
  for (const candidate of candidates) {
    for (const part of candidate.split(/(?<=[.!?])\s+/)) {
      const safe = sanitizeCampaignCopy(part, 500)
      const key = normalizeKey(safe)
      if (!safe || !key || seen.has(key)) continue
      seen.add(key)
      sentences.push(safe)
    }
  }

  const combined = clean(sentences.join(' '), 850)
  return combined || FALLBACK_COPY[lang] || FALLBACK_COPY.en
}

function captionChunks(text, maxChars = 58) {
  const sentences = String(text || '').split(/(?<=[.!?])\s+/).filter(Boolean)
  const chunks = []
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/).filter(Boolean)
    let current = ''
    for (const word of words) {
      const next = `${current} ${word}`.trim()
      if (next.length > maxChars && current) {
        chunks.push(current)
        current = word
      } else {
        current = next
      }
    }
    if (current) chunks.push(current)
  }
  return (chunks.length ? chunks : [text]).slice(0, 12)
}

function assTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0)
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = Math.floor(safe % 60)
  const cs = Math.floor((safe - Math.floor(safe)) * 100)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

function assEscape(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/[{}]/g, '')
    .replace(/\r?\n/g, '\\N')
}

function buildAss(campaign, text, duration) {
  const vertical = String(campaign?.channel || '') === 'short_video'
  const width = vertical ? 1080 : 1920
  const height = vertical ? 1920 : 1080
  const fontSize = vertical ? 46 : 50
  const marginV = vertical ? 185 : 105
  const marginH = vertical ? 82 : 150
  const chunks = captionChunks(text, vertical ? 35 : 58)
  const segment = Math.max(1.5, duration / Math.max(1, chunks.length))
  const events = chunks.map((caption, index) => {
    const start = index * segment
    const end = Math.min(duration, (index + 1) * segment + 0.18)
    return `Dialogue: 0,${assTime(start)},${assTime(end)},Caption,,0,0,0,,${assEscape(caption)}`
  }).join('\n')

  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nScaledBorderAndShadow: yes\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Caption,DejaVu Sans,${fontSize},&H00FFFFFF,&H000000FF,&H00020617,&H00020617,1,0,0,0,100,100,0,0,3,2,0,2,${marginH},${marginH},${marginV},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events}\n`
}

function run(command, args, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 240_000)
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', options.capture ? 'pipe' : 'inherit', 'pipe'] })
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

async function download(urlValue, dest) {
  const response = await fetch(urlValue, { cache: 'no-store' })
  if (!response.ok || !response.body) throw new Error(`Could not download base video: HTTP ${response.status}`)
  await pipeline(response.body, createWriteStream(dest))
}

async function sourceVideo(campaign, dest) {
  const video = campaign?.metadata?.video || {}
  const currentUrl = String(video.url || '').trim()
  if (currentUrl) {
    try {
      await download(currentUrl, dest)
      return
    } catch (error) {
      console.warn(`Campaign ${campaign.id}: current base URL failed; trying storage job path: ${errText(error)}`)
    }
  }

  const requestId = String(video.requestId || '').trim()
  if (!requestId) throw new Error('Base video URL and request ID are both missing')
  const { data: job, error } = await sb
    .from('cos_video_production_jobs')
    .select('output_url')
    .eq('id', requestId)
    .single()
  if (error || !job?.output_url) throw new Error(error?.message || 'Rendered job output path is missing')

  const output = String(job.output_url)
  if (/^https?:\/\//i.test(output)) {
    await download(output, dest)
    return
  }
  const { data: blob, error: storageError } = await sb.storage.from(renderBucket).download(output)
  if (storageError || !blob) throw new Error(`Could not download base object ${output}: ${storageError?.message || 'missing blob'}`)
  await writeFile(dest, Buffer.from(await blob.arrayBuffer()))
}

async function elevenLabs(text, dir) {
  if (!elevenLabsKey) return null
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(elevenLabsVoice)}`, {
    method: 'POST',
    headers: {
      'xi-api-key': elevenLabsKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: elevenLabsModel,
      voice_settings: { stability: 0.48, similarity_boost: 0.78 },
    }),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`ElevenLabs HTTP ${response.status}: ${detail.slice(0, 300)}`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (!bytes.length) throw new Error('ElevenLabs returned empty audio')
  const path = join(dir, 'voice.mp3')
  await writeFile(path, bytes)
  return { path, engine: 'elevenlabs' }
}

async function localVoice(text, lang, dir) {
  const textPath = join(dir, 'voice.txt')
  const audioPath = join(dir, 'voice.wav')
  await writeFile(textPath, text, 'utf8')
  await run('espeak-ng', ['-v', VOICES[lang] || VOICES.en, '-s', '150', '-p', '46', '-f', textPath, '-w', audioPath], { timeoutMs: 90_000 })
  return { path: audioPath, engine: 'espeak-ng-fallback' }
}

async function narration(text, lang, dir) {
  try {
    const eleven = await elevenLabs(text, dir)
    if (eleven) return eleven
  } catch (error) {
    console.error(`ElevenLabs unavailable; using local voice: ${errText(error)}`)
  }
  return localVoice(text, lang, dir)
}

async function audioDuration(path) {
  const output = await run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    path,
  ], { capture: true, timeoutMs: 30_000 })
  return Math.max(1, Number(output) || 1)
}

function assFilterPath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/'/g, "\\'")
}

async function uploadVoiced(campaign, lang, path) {
  const bytes = await readFile(path)
  const objectPath = `cos-voice/${campaign.id}/${lang}-${Date.now()}.mp4`
  const upload = await sb.storage.from(renderBucket).upload(objectPath, bytes, {
    contentType: 'video/mp4',
    upsert: true,
  })
  if (upload.error) throw new Error(`Voice video upload failed: ${upload.error.message}`)
  const signed = await sb.storage.from(renderBucket).createSignedUrl(objectPath, 60 * 60 * 24 * 7)
  if (signed.error || !signed.data?.signedUrl) throw new Error(`Could not sign voice video: ${signed.error?.message || 'missing signed URL'}`)
  return { objectPath, signedUrl: signed.data.signedUrl }
}

function isSilentPlaceholder(video) {
  const verified = video?.audioTrack === true && video?.captionsBurned === true
  return !verified && (
    video?.voiceFallback === true
    || String(video?.voiceStatus || '').toUpperCase() === 'COMPLETED_FALLBACK'
    || String(video?.voiceFallbackReason || '').toLowerCase().includes('base video promoted')
  )
}

function needsVoice(campaign) {
  const video = campaign?.metadata?.video || {}
  if (video.status !== 'ready' || !video.url) return false
  if (isSilentPlaceholder(video)) return true
  if (video.captionSchemaVersion !== CAPTION_SCHEMA_VERSION) return true
  if (video.copySchemaVersion !== COPY_SCHEMA_VERSION) return true
  if (video.audioTrack !== true || video.captionsBurned !== true) return true
  const lang = langOf(campaign)
  if (video?.brandedLangs?.[lang] && video?.voiceEngine) return false
  return !Boolean(video?.unbrandedVoiced?.[lang])
}

async function processCampaign(campaign) {
  const video = campaign?.metadata?.video || {}
  const lang = langOf(campaign)
  const text = scriptFrom(campaign)
  const dir = await mkdtemp(join(tmpdir(), 'signalboost-voice-'))
  const basePath = join(dir, 'base.mp4')
  const outputPath = join(dir, 'voiced-captioned.mp4')
  const assPath = join(dir, 'captions.ass')

  try {
    await sourceVideo(campaign, basePath)
    const voice = await narration(text, lang, dir)
    const spoken = await audioDuration(voice.path)
    const duration = Math.max(8, Math.min(90, Math.ceil(spoken) + 1))
    await writeFile(assPath, buildAss(campaign, text, duration), 'utf8')

    const vertical = String(campaign?.channel || '') === 'short_video'
    const panelY = vertical ? 'h*0.64' : 'h*0.69'
    const panelH = vertical ? 'h*0.31' : 'h*0.27'
    const videoFilter = `drawbox=x=0:y=${panelY}:w=iw:h=${panelH}:color=0x020617@0.96:t=fill,ass='${assFilterPath(assPath)}'`

    await run('ffmpeg', [
      '-y',
      '-stream_loop', '-1', '-i', basePath,
      '-i', voice.path,
      '-vf', videoFilter,
      '-map', '0:v:0', '-map', '1:a:0',
      '-t', String(duration),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
      '-c:a', 'aac', '-b:a', '160k',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      outputPath,
    ])

    const uploaded = await uploadVoiced(campaign, lang, outputPath)
    const current = (await sb.from('cos_campaign_queue').select('*').eq('id', campaign.id).single()).data || campaign
    const currentVideo = current?.metadata?.video || video
    const unbrandedVoiced = { ...(currentVideo.unbrandedVoiced || {}), [lang]: uploaded.signedUrl }
    const brandedLangs = { ...(currentVideo.brandedLangs || {}) }
    const voiced = { ...(currentVideo.voiced || {}) }
    delete brandedLangs[lang]
    delete voiced[lang]

    const patch = {
      ...currentVideo,
      status: 'ready',
      unbrandedVoiced,
      voiced,
      brandedLangs,
      voicedUrl: null,
      finalUrl: null,
      previewUrl: currentVideo.url || null,
      previewKind: currentVideo.url ? 'base draft' : null,
      branded: false,
      brandSchemaVersion: null,
      brandText: null,
      brandedAt: null,
      brandingLock: null,
      brandingExhausted: false,
      ghOverlayAttempts: { ...(currentVideo.ghOverlayAttempts || {}), [lang]: 0 },
      voiceLock: null,
      voiceStatus: 'COMPLETED',
      voiceFallback: voice.engine !== 'elevenlabs',
      voiceFallbackReason: voice.engine === 'elevenlabs' ? null : 'ElevenLabs was unavailable; a real local narration track was created with espeak-ng.',
      voiceEngine: voice.engine,
      voiceObjectPath: uploaded.objectPath,
      voiceCompletedAt: new Date().toISOString(),
      captionsBurned: true,
      audioTrack: true,
      captionSchemaVersion: CAPTION_SCHEMA_VERSION,
      copySchemaVersion: COPY_SCHEMA_VERSION,
      voiceScriptSource: 'sanitized-customer-facing-campaign-copy',
      voiceError: null,
      brandDebug: null,
    }

    const { error } = await sb
      .from('cos_campaign_queue')
      .update({ metadata: { ...(current.metadata || {}), video: patch } })
      .eq('id', campaign.id)
    if (error) throw error

    console.log(`COSA campaign ${campaign.id}: clean voice + high-contrast captions created (${lang}, ${voice.engine}, ${text.length} chars).`)
    return { ok: true, id: campaign.id, lang, engine: voice.engine }
  } catch (error) {
    const failure = errText(error)
    console.error(`COSA campaign ${campaign.id}: voice/caption stage failed: ${failure}`)
    const fresh = (await sb.from('cos_campaign_queue').select('*').eq('id', campaign.id).single()).data || campaign
    const freshVideo = fresh?.metadata?.video || video
    await sb.from('cos_campaign_queue').update({
      metadata: {
        ...(fresh.metadata || {}),
        video: {
          ...freshVideo,
          branded: false,
          voicedUrl: null,
          finalUrl: null,
          previewUrl: freshVideo.url || null,
          previewKind: freshVideo.url ? 'base draft' : null,
          voiceLock: null,
          voiceStatus: 'FAILED',
          voiceFallback: false,
          captionsBurned: false,
          audioTrack: false,
          voiceError: `voice/caption worker error: ${failure.slice(0, 500)}`,
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

const candidates = (campaigns || []).filter(needsVoice).slice(0, maxCampaigns)
console.log(`COSA voice worker scanned=${campaigns?.length || 0} candidates=${candidates.length} captionSchema=${CAPTION_SCHEMA_VERSION} copySchema=${COPY_SCHEMA_VERSION}`)
const results = []
for (const campaign of candidates) results.push(await processCampaign(campaign))
console.log(JSON.stringify({ ok: results.every(result => result.ok), processed: results.length, results }, null, 2))
