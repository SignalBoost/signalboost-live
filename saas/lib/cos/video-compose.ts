// saas/lib/cos/video-compose.ts
// Branded final-video assembly via JSON2Video (the ONLY reliable way to burn
// EXACT on-screen text — fal/Kling cannot render text).
//
// Input : a fal b-roll URL (background) + campaign + language.
// Output: one 60s MP4 with
//   - the b-roll looped to fill 60s as the background,
//   - an ElevenLabs voiceover,
//   - auto-transcribed captions (subtitles element),
//   - "SignalBoostAi" (gold) on screen in the first 3s and last 5s,
//   - "www.saas.signalboostapp.com" (cyan) on screen in the first 5s and last 5s.
//
// Verified against JSON2Video API v2 docs:
//   POST https://api.json2video.com/v2/movies        (header: x-api-key)
//   GET  https://api.json2video.com/v2/movies?project=ID   -> { movie: { status, url } }
//
// tsconfig non-strict: flat { ok, error? } results; never throws to callers.

const J2V_ENDPOINT = 'https://api.json2video.com/v2/movies'
const BRAND_NAME = 'SignalBoostAi'
const BRAND_URL = 'www.saas.signalboostapp.com'
const GOLD = '#ffc300'
const CYAN = '#1af0ff'
const TOTAL = 60            // seconds — final video length
const OUTRO_START = 55      // brand lockup reappears for the last 5s
const VOICE_MODEL = 'elevenlabs-flash-v2-5' // multilingual, included in JSON2Video credits
const VOICE_NAME = 'Brian'  // documented ElevenLabs voice; multilingual model speaks all 5

// Localized value narration (~120 words ≈ ~50s, leaving room for the outro).
// Used as the script when a per-language draft isn't present, so every language
// is spoken in-language and long enough to fill the minute.
const SCRIPT_BY_LANG: Record<string, string> = {
  en: `SignalBoostAi is your AI-powered growth department. It builds professional websites in minutes, creates branded content and videos, turns reviews into marketing posts, and prepares outreach campaigns across every channel. From websites to content to growth workflows, SignalBoost gives small businesses, agencies, hotels, restaurants, and entrepreneurs one AI system to look sharper and move faster. Every campaign is drafted for you and kept behind your approval before anything goes live. Automate your marketing, launch faster, and grow with confidence. Start building smarter today at saas.signalboostapp.com.`,
  es: `SignalBoostAi es tu departamento de crecimiento con inteligencia artificial. Crea sitios web profesionales en minutos, genera contenido y videos de marca, convierte reseñas en publicaciones de marketing y prepara campañas de difusión en todos los canales. Desde sitios web hasta contenido y flujos de crecimiento, SignalBoost ofrece a pequeñas empresas, agencias, hoteles, restaurantes y emprendedores un solo sistema de IA para verse mejor y avanzar más rápido. Cada campaña se redacta para ti y espera tu aprobación antes de publicarse. Automatiza tu marketing, lanza más rápido y crece con confianza. Empieza hoy en saas.signalboostapp.com.`,
  pt: `A SignalBoostAi é o seu departamento de crescimento com inteligência artificial. Cria sites profissionais em minutos, gera conteúdo e vídeos de marca, transforma avaliações em publicações de marketing e prepara campanhas de prospecção em todos os canais. De sites a conteúdo e fluxos de crescimento, a SignalBoost oferece a pequenas empresas, agências, hotéis, restaurantes e empreendedores um único sistema de IA para parecer melhor e avançar mais rápido. Cada campanha é redigida para você e aguarda a sua aprovação antes de ir ao ar. Automatize o seu marketing, lance mais rápido e cresça com confiança. Comece hoje em saas.signalboostapp.com.`,
  pl: `SignalBoostAi to twój dział wzrostu napędzany sztuczną inteligencją. Tworzy profesjonalne strony w kilka minut, generuje treści i filmy marki, zamienia opinie w posty marketingowe i przygotowuje kampanie docierania do klientów we wszystkich kanałach. Od stron po treści i procesy wzrostu, SignalBoost daje małym firmom, agencjom, hotelom, restauracjom i przedsiębiorcom jeden system SI, aby wyglądać lepiej i działać szybciej. Każda kampania jest przygotowywana za ciebie i czeka na twoją zgodę przed publikacją. Zautomatyzuj marketing, działaj szybciej i rozwijaj się z pewnością. Zacznij dziś na saas.signalboostapp.com.`,
  ru: `SignalBoostAi — это ваш отдел роста на основе искусственного интеллекта. Он создаёт профессиональные сайты за минуты, генерирует брендированный контент и видео, превращает отзывы в маркетинговые посты и готовит кампании по всем каналам. От сайтов до контента и процессов роста SignalBoost даёт малому бизнесу, агентствам, отелям, ресторанам и предпринимателям единую систему ИИ, чтобы выглядеть лучше и двигаться быстрее. Каждая кампания готовится за вас и ждёт вашего одобрения перед публикацией. Автоматизируйте маркетинг, запускайте быстрее и растите уверенно. Начните сегодня на saas.signalboostapp.com.`,
}

function scriptFor(campaign: any, lang: string): string {
  const items = Array.isArray(campaign?.work_items) ? campaign.work_items : []
  const match =
    items.find((it: any) => it?.input?.language === lang && it?.output) ||
    items.find((it: any) => it?.output)
  const o = (match && match.output) || {}
  const parts = [o.title, o.opening, o.draft, o.call_to_action]
    .map((v: any) => String(v || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  let text = parts.join('. ').replace(/\.\s*\.+/g, '.').replace(/\s+/g, ' ').trim()

  // Too short (or absent) -> use the localized value script so it fills ~50s in-language.
  const words = text.split(/\s+/).filter(Boolean).length
  if (words < 90) text = SCRIPT_BY_LANG[lang] || SCRIPT_BY_LANG.en

  // Keep it short enough to finish before the 55s outro window.
  if (text.length > 1000) {
    text = text.slice(0, 1000)
    const cut = Math.max(text.lastIndexOf('. '), text.lastIndexOf('! '), text.lastIndexOf('? '))
    if (cut > 600) text = text.slice(0, cut + 1)
  }
  return text
}

function brandText(text: string, color: string, sizePx: string, vpos: 'top' | 'center' | 'bottom', start: number, duration: number) {
  return {
    type: 'text',
    text,
    start,
    duration,
    'fade-in': 0.3,
    'fade-out': 0.3,
    'z-index': 40,
    settings: {
      'font-family': 'Montserrat',
      'font-weight': '900',
      'font-size': sizePx,
      'font-color': color,
      'text-align': 'center',
      'vertical-position': vpos,
      'horizontal-position': 'center',
      'text-shadow': '0px 3px 16px rgba(0,0,0,0.9)',
    },
  }
}

function buildBrandedMovie(opts: { brollUrl: string; aspect: '16:9' | '9:16'; script: string; lang: string; campaignId: string }) {
  const vertical = opts.aspect === '9:16'
  const width = vertical ? 1080 : 1920
  const height = vertical ? 1920 : 1080
  const nameSize = vertical ? '104px' : '92px'
  const urlSize = vertical ? '52px' : '48px'
  const capSize = vertical ? '64' : '52'

  return {
    width,
    height,
    quality: 'high',
    'client-data': { campaign_id: opts.campaignId, language: opts.lang },
    scenes: [
      {
        duration: TOTAL,
        elements: [
          // Background: fal b-roll, looped to fill the full minute.
          { type: 'video', src: opts.brollUrl, duration: -2, loop: 30, resize: 'cover', muted: true, 'z-index': 0 },
          // Voiceover (ElevenLabs, multilingual).
          { type: 'voice', model: VOICE_MODEL, voice: VOICE_NAME, text: opts.script },
          // Auto captions transcribed from the voiceover, bottom-safe.
          {
            type: 'subtitles',
            language: opts.lang,
            settings: {
              'font-family': 'Montserrat',
              'font-weight': '800',
              'font-size': capSize,
              'word-color': '#FFFFFF',
              'line-color': '#FFFFFF',
              'outline-color': '#000000',
              'outline-width': 6,
              'max-words-per-line': 6,
              position: 'bottom',
              style: 'classic',
            },
          },
        ],
      },
    ],
    // Movie-level overlays render on top of every scene. Timed brand lockups:
    //   name  -> top,    first 3s + last 5s
    //   url   -> center, first 5s + last 5s   (kept clear of the bottom captions)
    elements: [
      brandText(BRAND_NAME, GOLD, nameSize, 'top', 0, 3),
      brandText(BRAND_URL, CYAN, urlSize, 'center', 0, 5),
      brandText(BRAND_NAME, GOLD, nameSize, 'top', OUTRO_START, 5),
      brandText(BRAND_URL, CYAN, urlSize, 'center', OUTRO_START, 5),
    ],
  }
}

async function j2vHeaders() {
  const key = process.env.JSON2VIDEO_API_KEY
  if (!key) throw new Error('JSON2VIDEO_API_KEY not set')
  return { 'Content-Type': 'application/json', 'x-api-key': key }
}

// Submit + poll to completion (inside the caller's 300s budget).
export async function renderBrandedVideo(opts: {
  campaign: any
  brollUrl: string
  aspect: '16:9' | '9:16'
  lang: string
}): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    if (!opts.brollUrl) return { ok: false, error: 'No b-roll URL to brand.' }
    const script = scriptFor(opts.campaign, opts.lang)
    const movie = buildBrandedMovie({
      brollUrl: opts.brollUrl,
      aspect: opts.aspect,
      script,
      lang: opts.lang,
      campaignId: String(opts.campaign?.id || ''),
    })

    const headers = await j2vHeaders()
    const submitRes = await fetch(J2V_ENDPOINT, { method: 'POST', headers, body: JSON.stringify(movie) })
    const submitData: any = await submitRes.json().catch(() => ({}))
    if (!submitRes.ok || submitData?.success === false) {
      return { ok: false, error: submitData?.message || submitData?.error || `submit failed (${submitRes.status})` }
    }
    const project = submitData?.project || submitData?.movie?.project || submitData?.id
    if (!project) return { ok: false, error: 'No project id returned from JSON2Video.' }

    // Poll up to ~4 minutes.
    const deadline = Date.now() + 240_000
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 8000))
      const pollRes = await fetch(`${J2V_ENDPOINT}?project=${encodeURIComponent(project)}`, { headers })
      const pollData: any = await pollRes.json().catch(() => ({}))
      const m = pollData?.movie || {}
      const status = String(m?.status || '')
      if (status === 'done' && m?.url) return { ok: true, url: String(m.url) }
      if (status === 'error' || m?.success === false) return { ok: false, error: m?.message || 'render error' }
      // else: still 'running' / 'pending' — keep polling.
    }
    return { ok: false, error: 'JSON2Video render timed out.' }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'branded compose failed' }
  }
}
