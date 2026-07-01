// saas/lib/cos/video-compose.ts
// Branded final-video via JSON2Video.
// FIX: per JSON2Video spec, `subtitles` may ONLY live in the movie-level `elements`
// array (not inside a scene), and movie-level elements composite on TOP of every
// scene. So subtitles + the brand image overlay are declared at movie level with a
// high z-index. Caption accuracy for the brand name is enforced via keywords/replace.
const J2V_ENDPOINT = 'https://api.json2video.com/v2/movies'
const SITE = 'https://saas.signalboostapp.com'
const TOTAL = 60
const VOICE_MODEL = 'elevenlabs-flash-v2-5'
const VOICE_NAME = 'Adam'

const SCRIPT_BY_LANG: Record<string, string> = {
  en: `SignalBoostAi is your AI-powered growth department. It builds professional websites in minutes, creates branded content and videos, turns reviews into marketing posts, and prepares outreach campaigns across every channel. From websites to content to growth workflows, SignalBoost gives small businesses, agencies, hotels, restaurants, and entrepreneurs one AI system to look sharper and move faster. Every campaign is drafted for you and kept behind your approval before anything goes live. Automate your marketing, launch faster, and grow with confidence. Start building smarter today with SignalBoostAi.`,
  es: `SignalBoostAi es tu departamento de crecimiento con inteligencia artificial. Crea sitios web profesionales en minutos, genera contenido y videos de marca, convierte reseñas en publicaciones de marketing y prepara campañas de difusión en todos los canales. Desde sitios web hasta contenido y flujos de crecimiento, SignalBoost ofrece a pequeñas empresas, agencias, hoteles, restaurantes y emprendedores un solo sistema de inteligencia artificial para verse mejor y avanzar más rápido. Cada campaña se redacta para ti y espera tu aprobación antes de publicarse. Automatiza tu marketing, lanza más rápido y crece con confianza. Empieza a construir de forma más inteligente hoy con SignalBoostAi.`,
  pt: `A SignalBoostAi é o seu departamento de crescimento com inteligência artificial. Cria sites profissionais em minutos, gera conteúdo e vídeos de marca, transforma avaliações em publicações de marketing e prepara campanhas de prospecção em todos os canais. De sites a conteúdo e fluxos de crescimento, a SignalBoost oferece a pequenas empresas, agências, hotéis, restaurantes e empreendedores um único sistema de inteligência artificial para parecer melhor e avançar mais rápido. Cada campanha é redigida para você e aguarda a sua aprovação antes de ir ao ar. Automatize o seu marketing, lance mais rápido e cresça com confiança. Comece a construir de forma mais inteligente hoje com a SignalBoostAi.`,
  pl: `SignalBoostAi to twój dział wzrostu napędzany sztuczną inteligencją. Tworzy profesjonalne strony w kilka minut, generuje treści i filmy marki, zamienia opinie w posty marketingowe i przygotowuje kampanie docierania do klientów we wszystkich kanałach. Od stron po treści i procesy wzrostu, SignalBoost daje małym firmom, agencjom, hotelom, restauracjom i przedsiębiorcom jeden system sztucznej inteligencji, aby wyglądać lepiej i działać szybciej. Każda kampania jest przygotowywana za ciebie i czeka na twoją zgodę przed publikacją. Zautomatyzuj marketing, działaj szybciej i rozwijaj się z pewnością. Zacznij budować mądrzej już dziś z SignalBoostAi.`,
  ru: `SignalBoostAi — это ваш отдел роста на основе искусственного интеллекта. Он создаёт профессиональные сайты за минуты, генерирует брендированный контент и видео, превращает отзывы в маркетинговые посты и готовит кампании по всем каналам. От сайтов до контента и процессов роста SignalBoost даёт малому бизнесу, агентствам, отелям, ресторанам и предпринимателям единую систему искусственного интеллекта, чтобы выглядеть лучше и двигаться быстрее. Каждая кампания готовится за вас и ждёт вашего одобрения перед публикацией. Автоматизируйте маркетинг, запускайте быстрее и растите уверенно. Начните строить умнее уже сегодня с SignalBoostAi.`,
}

function stripUrls(text: string): string {
  return String(text || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\bwww\.\S+/gi, ' ')
    .replace(/\b[\w-]+\.(?:com|net|org|ai|app|io|co)\b\S*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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
  const words = text.split(/\s+/).filter(Boolean).length
  if (words < 90) text = SCRIPT_BY_LANG[lang] || SCRIPT_BY_LANG.en
  text = stripUrls(text)
  if (text.length > 1000) {
    text = text.slice(0, 1000)
    const cut = Math.max(text.lastIndexOf('. '), text.lastIndexOf('! '), text.lastIndexOf('? '))
    if (cut > 600) text = text.slice(0, cut + 1)
  }
  return text
}

function buildBrandedMovie(opts: { brollUrl: string; aspect: '16:9' | '9:16'; script: string; lang: string; campaignId: string }) {
  const vertical = opts.aspect === '9:16'
  const width = vertical ? 1080 : 1920
  const height = vertical ? 1920 : 1080
  const capSize = vertical ? 64 : 84
  const overlayUrl = `${SITE}/api/brand-overlay?a=${vertical ? '9x16' : '16x9'}`

  return {
    width,
    height,
    quality: 'high',
    'client-data': { campaign_id: opts.campaignId, language: opts.lang },
    scenes: [
      {
        // Scene length is driven by the (finite) voiceover; the b-roll loops to fill it.
        // JSON2Video spec: a forever-looping element (loop:-1) MUST set duration:-2 so it
        // extends to the container length. A positive/fixed duration with loop:-1 makes the
        // clip "play only once" — i.e. ~5s of motion then a frozen tail (the exact bug).
        duration: -1,
        elements: [
          { type: 'video', src: opts.brollUrl, loop: -1, duration: -2, resize: 'cover', muted: true },
          { type: 'voice', model: VOICE_MODEL, voice: VOICE_NAME, text: opts.script, 'model-settings': { language_code: opts.lang } },
        ],
      },
    ],
    // Movie-level elements composite on top of every scene.
    elements: [
      // Subtitles MUST be movie-level. keywords/replace force correct brand spelling.
      {
        type: 'subtitles',
        language: opts.lang,
        model: 'default',
        settings: {
          'font-family': 'Montserrat',
          'font-weight': '800',
          'font-size': capSize,
          'word-color': '#FFFFFF',
          'line-color': '#FFFFFF',
          'outline-color': '#000000',
          'outline-width': 6,
          'max-words-per-line': 6,
          position: 'bottom-center',
          style: 'classic',
          keywords: ['SignalBoost', 'SignalBoostAi'],
          replace: {
            'signal boost ai': 'SignalBoostAi',
            'signal boost a i': 'SignalBoostAi',
            'signal boost': 'SignalBoostAi',
            'signalboost': 'SignalBoostAi',
          },
        },
      },
      // Brand banner as a transparent PNG overlay — always renders, always on top.
      { type: 'image', src: overlayUrl, duration: -2, x: 0, y: 0, width, height, 'z-index': 99 },
    ],
  }
}

async function j2vHeaders() {
  const key = process.env.JSON2VIDEO_API_KEY
  if (!key) throw new Error('JSON2VIDEO_API_KEY not set')
  return { 'Content-Type': 'application/json', 'x-api-key': key }
}

// Pull whatever human-readable error JSON2Video hands back, wherever it hides it.
// Their error text can live at the top level or inside movie{} / tasks[] entries.
function j2vMessage(payload: any): string {
  const m = (payload && payload.movie) || {}
  const fromTasks = Array.isArray(m?.tasks)
    ? m.tasks.map((t: any) => t?.message || t?.error).filter(Boolean).join(' | ')
    : ''
  return String(
    m?.message || m?.error || payload?.message || payload?.error || fromTasks || '',
  ).slice(0, 400)
}

export async function renderBrandedVideo(opts: {
  campaign: any
  brollUrl: string
  aspect: '16:9' | '9:16'
  lang: string
}): Promise<{ ok: boolean; url?: string; error?: string; debug?: any }> {
  const campaignId = String(opts.campaign?.id || '')
  // Structured, secret-free trace. Ends up in Vercel logs AND (folded into the
  // returned error) on the campaign card's ⚠ line, so one render is conclusive.
  const trace: any = { campaignId, lang: opts.lang, aspect: opts.aspect, brandSchemaVersion: 7, phase: 'init' }
  const log = () => { try { console.log('[branded-video]', JSON.stringify(trace)) } catch {} }
  try {
    if (!opts.brollUrl) { trace.phase = 'no-broll'; log(); return { ok: false, error: 'No b-roll URL to brand.', debug: trace } }
    const script = scriptFor(opts.campaign, opts.lang)
    const movie = buildBrandedMovie({
      brollUrl: opts.brollUrl,
      aspect: opts.aspect,
      script,
      lang: opts.lang,
      campaignId,
    })
    const headers = await j2vHeaders()

    // --- Submit ---------------------------------------------------------------
    trace.phase = 'submit'
    const submitRes = await fetch(J2V_ENDPOINT, { method: 'POST', headers, body: JSON.stringify(movie) })
    const submitData: any = await submitRes.json().catch(() => ({}))
    trace.submitHttp = submitRes.status
    if (!submitRes.ok || submitData?.success === false) {
      const msg = j2vMessage(submitData) || `submit failed (${submitRes.status})`
      trace.phase = 'submit-rejected'; trace.error = msg; log()
      return { ok: false, error: `submit ${submitRes.status}: ${msg}`, debug: trace }
    }
    const project = submitData?.project || submitData?.movie?.project || submitData?.id
    if (!project) { trace.phase = 'no-project'; log(); return { ok: false, error: 'No project id returned from JSON2Video.', debug: trace } }
    trace.project = String(project)

    // --- Poll -----------------------------------------------------------------
    trace.phase = 'poll'
    let lastStatus = ''
    let lastMessage = ''
    const deadline = Date.now() + 240_000
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 8000))
      const pollRes = await fetch(`${J2V_ENDPOINT}?project=${encodeURIComponent(String(project))}`, { headers })
      const pollData: any = await pollRes.json().catch(() => ({}))
      const m = pollData?.movie || {}
      const status = String(m?.status || '')
      if (status) lastStatus = status
      const msg = j2vMessage(pollData)
      if (msg) lastMessage = msg
      if (status === 'done' && m?.url) {
        trace.phase = 'done'; trace.status = status; log()
        return { ok: true, url: String(m.url), debug: trace }
      }
      if (status === 'error' || m?.success === false || pollData?.success === false) {
        const em = msg || 'render error'
        trace.phase = 'render-error'; trace.status = status; trace.error = em; log()
        return { ok: false, error: `render error [${trace.project}]: ${em}`, debug: trace }
      }
    }
    trace.phase = 'timeout'; trace.status = lastStatus; trace.error = lastMessage; log()
    return {
      ok: false,
      error: `render timed out after 240s [${trace.project}, last status: ${lastStatus || 'unknown'}${lastMessage ? `, ${lastMessage}` : ''}]`,
      debug: trace,
    }
  } catch (e: any) {
    trace.phase = 'exception'; trace.error = e?.message || 'branded compose failed'; log()
    return { ok: false, error: e?.message || 'branded compose failed', debug: trace }
  }
}
