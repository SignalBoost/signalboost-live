// saas/lib/cos/video-compose.ts
// Branded final-video assembly via JSON2Video (the reliable path for burning
// exact on-screen text into the finished MP4).
//
// Input : a fal b-roll URL (background) + campaign + language.
// Output: one 60s MP4 with
//   - the b-roll looped to fill 60s as the background,
//   - an ElevenLabs voiceover,
//   - auto-transcribed captions (subtitles element),
//   - "SignalBoostAi" (gold) on screen for the full video,
//   - "www.saas.signalboostapp.com" (cyan) on screen for the full video.
//
// Important: the brand text is added INSIDE the scene elements array, not at a
// movie-level elements key, so it renders with the scene timeline instead of
// being ignored by JSON2Video.

const J2V_ENDPOINT = 'https://api.json2video.com/v2/movies'
const BRAND_NAME = 'SignalBoostAi'
const BRAND_URL = 'www.saas.signalboostapp.com'
const GOLD = '#ffc300'
const CYAN = '#1af0ff'
const TOTAL = 60
const OUTRO_START = TOTAL - 7
const VOICE_MODEL = 'elevenlabs-flash-v2-5'
const VOICE_NAME = 'Adam'

const SCRIPT_BY_LANG: Record<string, string> = {
  en: `SignalBoostAi is your AI-powered growth department. It builds professional websites in minutes, creates branded content and videos, turns reviews into marketing posts, and prepares outreach campaigns across every channel. From websites to content to growth workflows, SignalBoost gives small businesses, agencies, hotels, restaurants, and entrepreneurs one AI system to look sharper and move faster. Every campaign is drafted for you and kept behind your approval before anything goes live. Automate your marketing, launch faster, and grow with confidence. Start building smarter today at www.saas.signalboostapp.com.`,
  es: `SignalBoostAi es tu departamento de crecimiento con inteligencia artificial. Crea sitios web profesionales en minutos, genera contenido y videos de marca, convierte reseñas en publicaciones de marketing y prepara campañas de difusión en todos los canales. Desde sitios web hasta contenido y flujos de crecimiento, SignalBoost ofrece a pequeñas empresas, agencias, hoteles, restaurantes y emprendedores un solo sistema de IA para verse mejor y avanzar más rápido. Cada campaña se redacta para ti y espera tu aprobación antes de publicarse. Automatiza tu marketing, lanza más rápido y crece con confianza. Empieza hoy en www.saas.signalboostapp.com.`,
  pt: `A SignalBoostAi é o seu departamento de crescimento com inteligência artificial. Cria sites profissionais em minutos, gera conteúdo e vídeos de marca, transforma avaliações em publicações de marketing e prepara campanhas de prospecção em todos os canais. De sites a conteúdo e fluxos de crescimento, a SignalBoost oferece a pequenas empresas, agências, hotéis, restaurantes e empreendedores um único sistema de IA para parecer melhor e avançar mais rápido. Cada campanha é redigida para você e aguarda a sua aprovação antes de ir ao ar. Automatize o seu marketing, lance mais rápido e cresça com confiança. Comece hoje em www.saas.signalboostapp.com.`,
  pl: `SignalBoostAi to twój dział wzrostu napędzany sztuczną inteligencją. Tworzy profesjonalne strony w kilka minut, generuje treści i filmy marki, zamienia opinie w posty marketingowe i przygotowuje kampanie docierania do klientów we wszystkich kanałach. Od stron po treści i procesy wzrostu, SignalBoost daje małym firmom, agencjom, hotelom, restauracjom i przedsiębiorcom jeden system SI, aby wyglądać lepiej i działać szybciej. Każda kampania jest przygotowywana za ciebie i czeka na twoją zgodę przed publikacją. Zautomatyzuj marketing, działaj szybciej i rozwijaj się z pewnością. Zacznij dziś na www.saas.signalboostapp.com.`,
  ru: `SignalBoostAi — это ваш отдел роста на основе искусственного интеллекта. Он создаёт профессиональные сайты за минуты, генерирует брендированный контент и видео, превращает отзывы в маркетинговые посты и готовит кампании по всем каналам. От сайтов до контента и процессов роста SignalBoost даёт малому бизнесу, агентствам, отелям, ресторанам и предпринимателям единую систему ИИ, чтобы выглядеть лучше и двигаться быстрее. Каждая кампания готовится за вас и ждёт вашего одобрения перед публикацией. Автоматизируйте маркетинг, запускайте быстрее и растите уверенно. Начните сегодня на www.saas.signalboostapp.com.`,
}

function normalizeBrandUrl(text: string): string {
  return text
    .replace(/(?:www\.)?saas\.signalboostapp\.com/gi, BRAND_URL)
    .replace(/www\.saas\.signalboost\.com/gi, BRAND_URL)
    .replace(/signalboost\.com/gi, BRAND_URL)
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
  let text = normalizeBrandUrl(parts.join('. ').replace(/\.\s*\.+/g, '.').replace(/\s+/g, ' ').trim())
  const words = text.split(/\s+/).filter(Boolean).length
  if (words < 90) text = SCRIPT_BY_LANG[lang] || SCRIPT_BY_LANG.en
  text = normalizeBrandUrl(text)
  if (text.length > 1000) {
    text = text.slice(0, 1000)
    const cut = Math.max(text.lastIndexOf('. '), text.lastIndexOf('! '), text.lastIndexOf('? '))
    if (cut > 600) text = text.slice(0, cut + 1)
  }
  return text
}

function brandOverlay(start: number, vertical: boolean) {
  const canvasWidth = vertical ? 1080 : 1920
  const boxWidth = vertical ? 960 : 1500
  const y = vertical ? 72 : 44
  const nameSize = vertical ? '104px' : '92px'
  const urlSize = vertical ? '52px' : '48px'
  const html = `<div style="box-sizing:border-box;width:100%;padding:${vertical ? '42px 44px' : '34px 56px'};border-radius:28px;background:rgba(0,0,0,0.78);box-shadow:0 18px 48px rgba(0,0,0,0.65);text-align:center;font-family:Montserrat,Arial,sans-serif;line-height:1.08;"><div style="font-size:${nameSize};font-weight:900;color:${GOLD};text-shadow:0 4px 18px rgba(0,0,0,0.95);">${BRAND_NAME}</div><div style="margin-top:18px;font-size:${urlSize};font-weight:900;color:${CYAN};text-shadow:0 4px 18px rgba(0,0,0,0.95);">${BRAND_URL}</div></div>`
  return {
    type: 'html',
    html,
    start,
    duration: TOTAL,
    x: Math.round((canvasWidth - boxWidth) / 2),
    y,
    width: boxWidth,
    'fade-in': 0.2,
    'fade-out': 0.2,
    'z-index': 80,
  }
}

function buildBrandedMovie(opts: { brollUrl: string; aspect: '16:9' | '9:16'; script: string; lang: string; campaignId: string }) {
  const vertical = opts.aspect === '9:16'
  const width = vertical ? 1080 : 1920
  const height = vertical ? 1920 : 1080
  const capSize = vertical ? '64' : '52'

  return {
    width,
    height,
    quality: 'high',
    'client-data': { campaign_id: opts.campaignId, language: opts.lang, brand_name: BRAND_NAME, brand_url: BRAND_URL },
    scenes: [
      {
        duration: TOTAL,
        elements: [
          { type: 'video', src: opts.brollUrl, duration: TOTAL, loop: true, resize: 'cover', muted: true, 'z-index': 0 },
          { type: 'voice', model: VOICE_MODEL, voice: VOICE_NAME, text: opts.script, 'model-settings': { language_code: opts.lang } },
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
          brandOverlay(0, vertical),
        ],
      },
    ],
  }
}

async function j2vHeaders() {
  const key = process.env.JSON2VIDEO_API_KEY
  if (!key) throw new Error('JSON2VIDEO_API_KEY not set')
  return { 'Content-Type': 'application/json', 'x-api-key': key }
}

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

    const deadline = Date.now() + 240_000
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 8000))
      const pollRes = await fetch(`${J2V_ENDPOINT}?project=${encodeURIComponent(project)}`, { headers })
      const pollData: any = await pollRes.json().catch(() => ({}))
      const m = pollData?.movie || {}
      const status = String(m?.status || '')
      if (status === 'done' && m?.url) return { ok: true, url: String(m.url) }
      if (status === 'error' || m?.success === false) return { ok: false, error: m?.message || 'render error' }
    }
    return { ok: false, error: 'JSON2Video render timed out.' }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'branded compose failed' }
  }
}
