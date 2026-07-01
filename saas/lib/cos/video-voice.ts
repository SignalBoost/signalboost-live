// saas/lib/cos/video-voice.ts
// Turns a campaign's rendered Kling clip into a finished promo:
//
//   ElevenLabs TTS (>=60s script)  ->  base64 data URI
//     -> fal ffmpeg "compose": the clip tiled across the FULL narration length,
//        with the voiceover laid on top
//     -> fal auto-subtitle: burns synced captions (MANDATORY — retried, and if it
//        still fails we return an honest error instead of shipping a caption-less
//        video, because captions are a hard requirement).
//
// Guarantees vs the old version:
//   * final video is ALWAYS >= 60s (hard floor), up to 90s
//   * narration is padded per-language so it actually fills the minute
//   * clip length is PROBED (not assumed 5s), so tiling is correct for the new
//     15s multi-shot renders and any legacy 5s clips
//
// Runs entirely from Vercel — no self-hosted FFmpeg, no storage bucket (audio is
// handed to fal as a base64 data URI). tsconfig non-strict: flat { ok, error? }.

import { fal } from '@fal-ai/client'
import { generateSpeech } from '@/lib/elevenlabs/client'

const COMPOSE_MODEL = 'fal-ai/ffmpeg-api/compose'
const METADATA_MODEL = 'fal-ai/ffmpeg-api/metadata'
const CAPTION_MODEL = 'fal-ai/workflow-utilities/auto-subtitle'
const SITE_URL = 'saas.signalboostapp.com'

const MIN_TOTAL_MS = 60000   // hard floor: every finished video is at least 1 minute
const MAX_TOTAL_MS = 90000   // cap at 90s
const MIN_SCRIPT_WORDS = 150 // ~60s of speech at ~2.5 words/sec; pad below this
const CAPTION_ATTEMPTS = 3

const VOICE_BY_LANG: Record<string, string> = {
  en: 'EXAVITQu4vr4xnSDxMaL',
  es: '9BWtsMINqrJLrRacOk9x',
  pt: 'XB0fDUnXU5powFXDhCwa',
  pl: 'ThT5KcBeYPX3keUQqHPh',
  ru: 'z9fAnlkpzviPz146aGWa',
}

// Language-appropriate value narration (~120-140 words each ≈ ~55s). Used as the
// fallback when there's no draft AND as padding when a draft is too short, so the
// spoken track is never in the wrong language and always long enough to fill 60s.
const FILLER_BY_LANG: Record<string, string> = {
  en: `SignalBoost is your AI-powered growth department. It builds professional websites in minutes, creates branded content and videos, and runs automated outreach across every channel, so you reach more customers without adding manual work. Beyond marketing, SignalBoost audits your code, your security, and your operations, giving you one control plane for growth and protection. Every campaign is drafted for you, kept behind an approval gate, published when you say go, and measured so the next one performs even better. Whether you are launching a product, collecting reviews, or scaling outreach, SignalBoost turns one simple command into finished, review-ready work. Automate your marketing, launch faster, and grow with confidence. See how it works and get started today at ${SITE_URL}.`,
  es: `SignalBoost es tu departamento de crecimiento impulsado por inteligencia artificial. Crea sitios web profesionales en minutos, genera contenido y videos de marca, y ejecuta campañas de difusión automatizadas en todos los canales, para que llegues a más clientes sin trabajo manual. Más allá del marketing, SignalBoost audita tu código, tu seguridad y tus operaciones, dándote un único panel de control para crecer y protegerte. Cada campaña se redacta para ti, permanece tras una aprobación, se publica cuando tú lo indicas y se mide para que la siguiente rinda aún mejor. Ya sea que lances un producto, recojas reseñas o amplíes tu alcance, SignalBoost convierte un simple comando en trabajo terminado y listo para revisar. Automatiza tu marketing, lanza más rápido y crece con confianza. Descubre cómo funciona y comienza hoy en ${SITE_URL}.`,
  pt: `A SignalBoost é o seu departamento de crescimento com inteligência artificial. Ela cria sites profissionais em minutos, gera conteúdo e vídeos de marca e executa prospecção automatizada em todos os canais, para você alcançar mais clientes sem trabalho manual. Além do marketing, a SignalBoost audita o seu código, a sua segurança e as suas operações, oferecendo um único painel de controle para crescer e se proteger. Cada campanha é redigida para você, fica atrás de uma aprovação, é publicada quando você autoriza e é medida para que a próxima tenha um desempenho ainda melhor. Seja lançando um produto, coletando avaliações ou ampliando o alcance, a SignalBoost transforma um simples comando em trabalho pronto para revisão. Automatize o seu marketing, lance mais rápido e cresça com confiança. Veja como funciona e comece hoje em ${SITE_URL}.`,
  pl: `SignalBoost to twój dział wzrostu napędzany sztuczną inteligencją. Tworzy profesjonalne strony internetowe w kilka minut, generuje treści i filmy marki oraz prowadzi zautomatyzowane kampanie docierania do klientów we wszystkich kanałach, dzięki czemu docierasz do większej liczby klientów bez pracy ręcznej. Poza marketingiem SignalBoost audytuje twój kod, bezpieczeństwo i operacje, dając jeden panel kontroli wzrostu i ochrony. Każda kampania jest przygotowywana za ciebie, pozostaje za zatwierdzeniem, jest publikowana, gdy wydasz zgodę, i mierzona, aby kolejna działała jeszcze lepiej. Niezależnie od tego, czy wprowadzasz produkt, zbierasz opinie, czy zwiększasz zasięg, SignalBoost zamienia jedno proste polecenie w gotową pracę do przeglądu. Zautomatyzuj marketing, działaj szybciej i rozwijaj się z pewnością. Zobacz, jak to działa, i zacznij już dziś na ${SITE_URL}.`,
  ru: `SignalBoost — это ваш отдел роста на основе искусственного интеллекта. Он создаёт профессиональные сайты за минуты, генерирует брендированный контент и видео и запускает автоматизированные рассылки по всем каналам, чтобы вы привлекали больше клиентов без ручной работы. Помимо маркетинга, SignalBoost проверяет ваш код, безопасность и операции, предоставляя единую панель управления ростом и защитой. Каждая кампания готовится за вас, остаётся за подтверждением, публикуется по вашей команде и измеряется, чтобы следующая работала ещё лучше. Запускаете ли вы продукт, собираете отзывы или расширяете охват, SignalBoost превращает одну простую команду в готовую к проверке работу. Автоматизируйте маркетинг, запускайте быстрее и растите уверенно. Узнайте, как это работает, и начните сегодня на ${SITE_URL}.`,
}

let falConfigured = false
function ensureFal() {
  if (!falConfigured) { fal.config({ credentials: process.env.FAL_KEY }); falConfigured = true }
}
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }
function wordCount(s: string) { return s.split(/\s+/).filter(Boolean).length }

// Build a spoken script from the per-language draft, padded to fill ~60s in the
// correct language, capped on a sentence boundary, always ending with the site URL.
function narrationFor(campaign: any, lang: string): string {
  const filler = FILLER_BY_LANG[lang] || FILLER_BY_LANG.en
  const items = Array.isArray(campaign.work_items) ? campaign.work_items : []
  const match =
    items.find((it: any) => it?.input?.language === lang && it?.output) ||
    items.find((it: any) => it?.output)
  const o = (match && match.output) || {}
  const parts = [o.title, o.opening, o.draft, o.call_to_action]
    .map((v: any) => String(v || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  let text = parts.join('. ').replace(/\.\s*\.+/g, '.').replace(/\s+/g, ' ').trim()

  // No draft at all -> use the localized value narration outright.
  if (!text) text = filler
  // Draft too short to fill a minute -> pad with the localized value narration.
  else if (wordCount(text) < MIN_SCRIPT_WORDS) text = `${text} ${filler}`.replace(/\s+/g, ' ').trim()

  // Cap length on a sentence boundary so TTS/captions stay clean.
  if (text.length > 1500) {
    text = text.slice(0, 1500)
    const cut = Math.max(text.lastIndexOf('. '), text.lastIndexOf('! '), text.lastIndexOf('? '))
    if (cut > 900) text = text.slice(0, cut + 1)
  }

  if (!/signalboostapp\.com/i.test(text)) {
    text = `${text} ${SITE_URL}`.replace(/\s+/g, ' ').trim()
  }
  return text
}

// Rough fallback duration if fal metadata is unavailable: ~150 wpm, padded 15%.
function estimateMs(text: string): number {
  return Math.round((wordCount(text) / 2.5) * 1000 * 1.15)
}

// Read real media duration (seconds -> ms) from fal metadata; fall back on error.
async function probeMediaMs(mediaUrl: string, fallbackMs: number): Promise<number> {
  try {
    const r: any = await fal.subscribe(METADATA_MODEL, { input: { media_url: mediaUrl } })
    const d = r?.data || {}
    const sec =
      d?.media?.duration ??
      d?.duration ??
      d?.video?.duration ??
      d?.audio?.duration ??
      (Array.isArray(d?.streams) ? d.streams.find((s: any) => s?.duration)?.duration : undefined)
    const ms = Number(sec) * 1000
    if (Number.isFinite(ms) && ms > 500) return ms
  } catch {}
  return fallbackMs
}

// Tile the clip across [0, totalMs) using its real length; last frame truncated.
function buildVideoKeyframes(url: string, clipMs: number, totalMs: number) {
  const frames: { timestamp: number; duration: number; url: string }[] = []
  const step = Math.max(1000, Math.floor(clipMs))
  let t = 0
  while (t < totalMs) {
    const dur = Math.min(step, totalMs - t)
    frames.push({ timestamp: t, duration: dur, url })
    t += dur
  }
  return frames
}

// MANDATORY captions: retry, then honest failure. Captions are a hard requirement.
async function burnCaptions(videoUrl: string, lang: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  let lastErr = 'caption step failed'
  for (let attempt = 1; attempt <= CAPTION_ATTEMPTS; attempt++) {
    try {
      const cap: any = await fal.subscribe(CAPTION_MODEL, {
        input: {
          video_url: videoUrl,
          language: lang,
          position: 'bottom',
          words_per_subtitle: 5,
          font_name: 'Montserrat',
          font_size: 84,
          font_weight: 'bold',
          font_color: 'white',
          stroke_color: 'black',
          stroke_width: 3,
          y_offset: 100,
          enable_animation: false,
        },
      })
      const url = cap?.data?.video?.url || cap?.data?.video_url
      if (url) return { ok: true, url: String(url) }
      lastErr = 'captioner returned no video url'
    } catch (e: any) {
      lastErr = e?.message || 'captioner error'
    }
    if (attempt < CAPTION_ATTEMPTS) await sleep(1500)
  }
  return { ok: false, error: lastErr }
}

export async function addVoiceToCampaignVideo(
  campaign: any,
  lang: string = 'en'
): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const videoUrl = campaign?.metadata?.video?.url
    if (!videoUrl) return { ok: false, error: 'No rendered video to voice.' }

    const voiceId = VOICE_BY_LANG[lang] || VOICE_BY_LANG.en
    const text = narrationFor(campaign, lang)

    // 1) Text -> speech (mp3 bytes) -> base64 data URI (no storage bucket needed).
    let audio: ArrayBuffer
    try {
      audio = await generateSpeech({ text, voiceId })
    } catch (e: any) {
      return { ok: false, error: `TTS failed: ${e?.message || 'unknown'}` }
    }
    const audioDataUri = `data:audio/mpeg;base64,${Buffer.from(audio).toString('base64')}`

    ensureFal()

    // 2) Final length = real narration duration, floored at 60s, capped at 90s.
    const audioMs = await probeMediaMs(audioDataUri, estimateMs(text))
    const totalMs = Math.min(Math.max(Math.ceil(audioMs), MIN_TOTAL_MS), MAX_TOTAL_MS)

    // 3) Probe the clip's real length so tiling is correct (15s multi-shot or 5s legacy).
    const clipMs = await probeMediaMs(String(videoUrl), 5000)

    // 4) Compose: tile the clip across the timeline, lay the voice on top.
    const tracks = [
      { id: 'video', type: 'video', keyframes: buildVideoKeyframes(String(videoUrl), clipMs, totalMs) },
      { id: 'voice', type: 'audio', keyframes: [{ timestamp: 0, duration: totalMs, url: audioDataUri }] },
    ]
    let composed: any
    try {
      composed = await fal.subscribe(COMPOSE_MODEL, { input: { tracks } })
    } catch (e: any) {
      return { ok: false, error: `compose failed: ${e?.message || 'unknown'}` }
    }
    const composedUrl = String(composed?.data?.video_url || composed?.data?.video?.url || '')
    if (!composedUrl) return { ok: false, error: 'compose returned no video url' }

    // 5) Burn captions — mandatory. If it fails after retries, surface the error
    //    (the card shows it) rather than shipping a caption-less video.
    const cap = await burnCaptions(composedUrl, lang)
    if (!cap.ok || !cap.url) {
      return { ok: false, error: `Captions failed: ${cap.error || 'unknown'}. Video not finalized — click Add voice to retry.` }
    }

    return { ok: true, url: cap.url }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'voice compose failed' }
  }
}
