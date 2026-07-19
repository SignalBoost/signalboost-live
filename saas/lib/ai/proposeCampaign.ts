// saas/lib/ai/proposeCampaign.ts
// On-demand COS marketing campaign creation for the Chief of Staff chat tool.
// Creates real cos_campaign_queue rows and starts the internal render pipeline.
// Owner instructions are retained as internal context only; customer-facing
// campaign copy is sanitized before it can become narration or captions.

import { createClient } from '@supabase/supabase-js'
import { queueItemFromRecommendation } from '@/lib/cos/campaign-queue'
import type { CosChannel, CosDepartment, CosPriority, CosRecommendation } from '@/lib/cos/recommendation/types'
import { startSiteVideo } from '@/lib/operator/video'

const SAAS_URL = 'www.saas.signalboostapp.com'
const VIDEO_CHANNELS = new Set(['youtube', 'short_video'])
const allowedLanguages = ['en', 'es', 'pt', 'pl', 'ru']
const GITHUB_OWNER = 'SignalBoost'
const GITHUB_REPO = 'signalboost-live'
const VIDEO_WORKFLOW = 'cos-video-production.yml'
const COPY_SCHEMA_VERSION = 'signalboost-campaign-copy-v2-clean'

type RegionalSpec = {
  lang: string
  region: string
  label: string
  audience: string
  angle: string
}

const REGIONAL_SPECS: RegionalSpec[] = [
  {
    lang: 'en',
    region: 'us',
    label: 'English / United States',
    audience: 'U.S. small businesses, agencies, consultants, startups, restaurants, hotels, and sales teams.',
    angle: 'Launch campaigns faster with minimal manual work while preserving human approval and control.',
  },
  {
    lang: 'es',
    region: 'latam',
    label: 'Spanish / LATAM',
    audience: 'LATAM business owners, agencies, hotels, restaurants, consultants, and entrepreneurs.',
    angle: 'Create professional marketing campaigns without a large marketing team, with practical mobile-first growth workflows.',
  },
  {
    lang: 'pt',
    region: 'brazil',
    label: 'Portuguese / Brazil',
    audience: 'Brazilian small businesses, agencies, entrepreneurs, restaurants, hotels, and service companies.',
    angle: 'Turn a business idea into a campaign faster with professional content and outreach preparation in Brazilian Portuguese.',
  },
  {
    lang: 'pl',
    region: 'poland',
    label: 'Polish / Poland',
    audience: 'Polish business owners, startups, agencies, consultants, and service companies.',
    angle: 'Controlled AI automation for serious businesses that want speed without losing oversight.',
  },
  {
    lang: 'ru',
    region: 'global_ru',
    label: 'Russian / Global Russian-speaking audience',
    audience: 'Russian-speaking entrepreneurs, agencies, consultants, and business operators.',
    angle: 'Structured AI campaign execution with speed, clarity, multilingual outreach, analytics, and human approval.',
  },
]

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function text(value: any, fallback = '', max = 1600) {
  const out = String(value || '').replace(/\s+/g, ' ').trim()
  return (out || fallback).slice(0, max)
}

function langOf(value: any) {
  const l = String(value || 'en').toLowerCase().trim()
  return allowedLanguages.includes(l) ? l : 'en'
}

function normalizeKey(value: any) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0400-\u04ff]+/g, ' ')
    .trim()
}

function isProductionInstruction(fragment: string) {
  const value = String(fragment || '').trim()
  if (!value) return true
  const lower = value.toLowerCase()

  if (/(do not repeat|don['’]t repeat|must not repeat|not be repeated|do not mention|don['’]t mention|do not say|ignore previous|system prompt|user prompt|these instructions|the instructions|não repita|nao repita|não repetir|nao repetir|não mencione|nao mencione|não diga|nao diga|estas instruções|essas instruções|sin repetir|no repitas|no repetir|no menciones|no digas|estas instrucciones|nie powtarzaj|nie wspominaj|nie mów|tych instrukcji|не повторяй|не упоминай|не говори|эти инструкции)/i.test(lower)) return true

  if (/^(instructions?|requirements?|prompt|system|assistant|voiceover|narration|captions?|subtitles?|scenes?|visuals?|format|duration|aspect ratio|tone|style|language|target audience|audience|cta|hook|instruções|requisitos|narração|legendas|cenas|formato|duração|idioma|público[- ]alvo|instrucciones|requisitos|narración|subtítulos|escenas|formato|duración|idioma|público objetivo|instrukcje|wymagania|narracja|napisy|sceny|format|czas trwania|język|grupa docelowa|инструкции|требования|озвучка|субтитры|сцены|формат|длительность|язык|аудитория)\s*[:\-–—]/i.test(value)) return true

  const productionWords = /(prompt|instruction|requirement|assistant|the ai|this ai|voiceover|narration|caption|subtitle|on[- ]screen|screen text|scene|shot|camera|b[- ]roll|watermark|aspect ratio|duration|render|production|visual direction|logo placement|narração|legenda|texto na tela|cena|filmagem|câmera|duração|renderização|produção|direção visual|narración|subtítulo|texto en pantalla|escena|cámara|duración|producción|narracja|napisy|tekst na ekranie|scena|kamera|czas trwania|produkcja|озвучка|субтитры|текст на экране|сцена|камера|длительность|производство)/i
  const directive = /^(please\s+)?(must|should|do not|don['’]t|never|use|show|include|add|create|make|generate|write|say|mention|avoid|keep|ensure|please|não|nao|use|mostre|inclua|adicione|crie|gere|escreva|diga|evite|mantenha|garanta|no|usa|muestra|incluye|añade|crea|genera|escribe|di|evita|mantén|asegura|nie|użyj|pokaz|dodaj|utwórz|wygeneruj|napisz|powiedz|unikaj|zachowaj|upewnij|не|используй|покажи|добавь|создай|сгенерируй|напиши|скажи|избегай|сохрани|убедись)\b/i
  if (productionWords.test(value) && directive.test(value)) return true

  return /(ai|assistant|model|cosa).{0,40}(must|should|do not|don['’]t|repeat|mention|say|include|use|não|nao|deve|repita|mencione|diga|no debe|repita|mencione|diga|powinien|nie może|powtarzaj|wspominaj|mów|должен|не должен|повторять|упоминать|говорить)/i.test(value)
}

function sanitizeCampaignCopy(value: any, max = 1400) {
  const source = String(value || '').replace(/[•▪◦]/g, '\n').trim()
  if (!source) return ''

  const fragments = source
    .split(/\n+|(?<=[.!?])\s+|\s*;\s+/)
    .map((part) => part.replace(/^[-–—*#\d.)\s]+/, '').trim())
    .filter(Boolean)

  const kept: string[] = []
  const seen = new Set<string>()
  for (let fragment of fragments) {
    fragment = fragment
      .replace(/^(script|copy|campaign copy|mensagem|texto|guion|scenariusz|текст)\s*[:\-–—]\s*/i, '')
      .replace(/\[[^\]]*(instruction|caption|subtitle|scene|prompt|instru|legenda|subtítulo|napisy|инструк)[^\]]*\]/gi, '')
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/\s+/g, ' ')
      .trim()

    if (!fragment || isProductionInstruction(fragment)) continue
    const key = normalizeKey(fragment)
    if (!key || seen.has(key)) continue
    seen.add(key)
    kept.push(fragment)
  }

  return text(kept.join(' '), '', max)
}

function channelOf(...values: any[]): CosChannel {
  const raw = values.map((v) => String(v || '')).join(' ').toLowerCase()
  if (raw.includes('short') || raw.includes('tiktok') || raw.includes('reel') || raw.includes('9:16') || raw.includes('vertical')) return 'short_video'
  if (raw.includes('youtube') || raw.includes('video') || raw.includes('vídeo') || raw.includes('wideo') || raw.includes('видео')) return 'youtube'
  if (raw.includes('linkedin')) return 'linkedin'
  if (raw.includes('blog')) return 'blog'
  if (raw.includes('email')) return 'email'
  if (raw.includes('outreach')) return 'outreach'
  if (raw.includes('landing')) return 'landing_page'
  if (raw.includes('review')) return 'review_campaign'
  return 'youtube'
}

function departmentOf(channel: CosChannel): CosDepartment {
  return channel === 'email' || channel === 'outreach' ? 'sales' : 'marketing'
}

function titleFrom(args: any, channel: CosChannel) {
  const safe = sanitizeCampaignCopy(args.title || args.goal || args.objective, 140)
  return safe || (channel === 'short_video' ? 'SignalBoostAi short promo video' : 'SignalBoostAi promotional video')
}

function fallbackScript(lang: string, subject: string, audience: string, offer: string) {
  const topic = subject || 'professional marketing campaigns'
  if (lang === 'pt') return `A SignalBoostAi ajuda ${audience} a transformar ${topic} em uma campanha profissional com mais rapidez. Crie os materiais, revise tudo e mantenha o controle antes da publicação. ${offer}`
  if (lang === 'es') return `SignalBoostAi ayuda a ${audience} a convertir ${topic} en una campaña profesional con mayor rapidez. Crea los recursos, revisa todo y mantén el control antes de publicar. ${offer}`
  if (lang === 'pl') return `SignalBoostAi pomaga ${audience} szybciej zamienić ${topic} w profesjonalną kampanię. Utwórz materiały, sprawdź wszystko i zachowaj kontrolę przed publikacją. ${offer}`
  if (lang === 'ru') return `SignalBoostAi помогает ${audience} быстрее превратить ${topic} в профессиональную кампанию. Подготовьте материалы, проверьте всё и сохраняйте контроль до публикации. ${offer}`
  return `SignalBoostAi helps ${audience} turn ${topic} into a professional campaign faster. Create the assets, review everything, and stay in control before publishing. ${offer}`
}

function scriptFrom(args: any, lang: string, audience: string, offer: string) {
  // sourceMaterial is a brief, not automatically a voiceover. Only explicitly
  // named customer copy fields can become the first-choice script.
  const explicit = sanitizeCampaignCopy(args.voiceover || args.script || args.body || '', 1400)
  if (explicit) return explicit

  const subject = sanitizeCampaignCopy(args.goal || args.objective || args.sourceMaterial || '', 420)
  return sanitizeCampaignCopy(fallbackScript(lang, subject, audience, offer), 1400)
}

function visualPrompt(goal: string, audience: string, region?: string) {
  return [
    'Premium AI SaaS product demo b-roll for a business growth platform.',
    `Theme: ${sanitizeCampaignCopy(goal, 220) || 'business growth and campaign automation'}.`,
    `Audience: ${sanitizeCampaignCopy(audience, 180) || 'small businesses and agencies'}.`,
    region ? `Regional market: ${region}.` : '',
    'Modern dark navy and black SaaS dashboards, gold and cyan accents, website previews, AI automation workflows, growth charts, small business owners, agency operators, hotel and restaurant entrepreneurs, smooth professional camera motion.',
    'No on-screen words, no captions, no subtitles, no logos, no signage, no watermarks, and no URLs.',
  ].join(' ').slice(0, 900)
}

function rowFromQueueItem(item: ReturnType<typeof queueItemFromRecommendation>) {
  return {
    recommendation_id: item.recommendation_id,
    department: item.department,
    title: item.title,
    objective: item.objective,
    channel: item.channel,
    audience: item.audience,
    languages: item.languages,
    assets: item.assets,
    work_items: item.work_items,
    recommendation: item.recommendation,
    status: item.status,
    risk_level: item.risk_level,
    approval_required: item.approval_required,
    metadata: item.metadata || {},
  }
}

function wantsRegionalBatch(args: any) {
  const body = `${args?.goal || ''} ${args?.objective || ''} ${args?.sourceMaterial || ''} ${args?.title || ''}`.toLowerCase()
  if (String(args?.language || args?.lang || '').toLowerCase() === 'all') return true
  return body.includes('five separate') || body.includes('five regional') || body.includes('region-specific') || body.includes('multilingual') || (body.includes('latam') && body.includes('brazil') && body.includes('poland'))
}

function regionalScript(spec: RegionalSpec, offer: string) {
  return sanitizeCampaignCopy(`SignalBoostAi helps ${spec.audience} start professional marketing campaigns with less manual work. ${spec.angle} Campaign assets are prepared for review before publishing, so businesses move faster while preserving human control. ${offer}`, 1400)
}

function openingFor(lang: string) {
  if (lang === 'pt') return 'A SignalBoostAi ajuda empresas a criar campanhas profissionais com mais rapidez.'
  if (lang === 'es') return 'SignalBoostAi ayuda a las empresas a crear campañas profesionales con mayor rapidez.'
  if (lang === 'pl') return 'SignalBoostAi pomaga firmom szybciej tworzyć profesjonalne kampanie.'
  if (lang === 'ru') return 'SignalBoostAi помогает компаниям быстрее создавать профессиональные кампании.'
  return 'SignalBoostAi helps businesses create professional campaigns faster.'
}

async function dispatchVideoWorker(): Promise<{ ok: boolean; skipped?: boolean; status?: number; error?: string }> {
  const token = process.env.GITHUB_WRITE_TOKEN || process.env.GITHUB_TOKEN
  if (!token) return { ok: false, skipped: true, error: 'GitHub Actions token is not configured; scheduled worker remains the fallback.' }
  try {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${VIDEO_WORKFLOW}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
      cache: 'no-store',
    })
    if (response.status === 204) return { ok: true, status: response.status }
    return { ok: false, status: response.status, error: (await response.text()).slice(0, 500) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'GitHub Actions dispatch failed.' }
  }
}

export interface ProposeCampaignResult {
  ok: boolean
  campaignId?: string
  campaignIds?: string[]
  status?: string
  render?: any
  error?: string
}

async function createOneCampaign(admin: any, args: any, spec?: RegionalSpec): Promise<{ ok: boolean; campaignId?: string; render?: any; error?: string }> {
  const rawGoal = args?.goal || args?.objective || args?.sourceMaterial
  const baseGoal = sanitizeCampaignCopy(rawGoal, 1200) || 'Promote SignalBoostAi to businesses that need faster, controlled marketing execution.'
  const channel = channelOf(args?.channel, args?.goal, args?.objective, args?.sourceMaterial)
  const lang = spec?.lang || langOf(args?.language || args?.lang)
  const audience = spec?.audience || sanitizeCampaignCopy(args?.audience, 400) || 'small businesses, agencies, hotels, restaurants, and entrepreneurs'
  const offer = sanitizeCampaignCopy(args?.offer || args?.callToAction, 300) || `Start your free trial at ${SAAS_URL}.`
  const goal = spec ? `${spec.angle} ${baseGoal}` : baseGoal
  const title = spec ? `SignalBoostAi demo — ${spec.label}` : titleFrom(args, channel)
  const script = spec ? regionalScript(spec, offer) : scriptFrom(args, lang, audience, offer)
  const now = new Date().toISOString()

  const recommendation: CosRecommendation = {
    id: id('rec_cos_video'),
    department: departmentOf(channel),
    title,
    summary: `${goal} Target audience: ${audience}. CTA: ${offer}.`,
    recommended_channel: channel,
    priority: 'high' as CosPriority,
    confidence: 90,
    expected_roi: 'medium',
    estimated_cost_usd: VIDEO_CHANNELS.has(channel) ? 12 : 5,
    reason: 'Owner/COS requested an executable marketing campaign from chat. Prepare the full video for owner review; publishing happens automatically after owner approval.',
    signals: [{ id: id('signal'), source: 'cos_chat_video_campaign_tool', metric: 'owner_campaign_request', value: title, confidence: 95, observed_at: now, evidence: [goal, script] }],
    approval_status: 'pending_approval',
    created_at: now,
  }

  const item = queueItemFromRecommendation(recommendation)
  const row: any = rowFromQueueItem(item)
  row.status = 'waiting_approval'
  row.approval_required = true
  row.approved_by = null
  row.approved_at = null
  row.languages = [lang]
  row.work_items = (Array.isArray(row.work_items) ? row.work_items : []).map((w: any) => ({
    ...w,
    status: 'drafted',
    input: { ...(w.input || {}), language: lang, region: spec?.region || null },
    output: {
      title,
      opening: openingFor(lang),
      draft: script,
      call_to_action: offer,
    },
  }))
  row.metadata = {
    ...(row.metadata || {}),
    source: spec ? 'cos_chat_regional_video_batch_tool' : 'cos_chat_video_campaign_tool',
    campaign_script: script,
    campaign_copy_schema_version: COPY_SCHEMA_VERSION,
    owner_brief_internal_only: true,
    owner_review_note: 'Production runs automatically. After approval, publishing is automatic once the video is branded and passes quality gates.',
    required_burned_in_text: ['SignalBoostAi', SAAS_URL],
    regional_campaign: spec ? { language: spec.lang, region: spec.region, label: spec.label, angle: spec.angle } : null,
  }

  let render: any = null
  if (VIDEO_CHANNELS.has(channel)) {
    const aspect: '16:9' | '9:16' = channel === 'short_video' ? '9:16' : '16:9'
    const prompt = visualPrompt(goal, audience, spec?.region)
    const started = await startSiteVideo(prompt, aspect, { lang, title, hook: script.slice(0, 160) })
    render = started
    if (started.ok) {
      row.metadata.video = {
        status: 'rendering',
        requestId: started.requestId,
        model: started.model,
        aspect,
        prompt,
        started_at: now,
        voicedUrl: null,
        voiced: {},
        branded: false,
        brandedLangs: {},
        unbrandedVoiced: {},
        brandSchemaVersion: null,
        brandText: null,
        brandedAt: null,
        voiceError: null,
        brandAttempts: {},
        ghOverlayAttempts: {},
        brandingLock: null,
      }
    }
  }

  const { data, error } = await admin.from('cos_campaign_queue').insert(row).select('*').single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, campaignId: data.id, render }
}

export async function proposeCampaign(args: any, _approvedByUserId?: string | null): Promise<ProposeCampaignResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { ok: false, error: 'Supabase service credentials not configured' }
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  if (wantsRegionalBatch(args)) {
    const results = []
    for (const spec of REGIONAL_SPECS) {
      const result = await createOneCampaign(admin, args, spec)
      results.push({ ...result, language: spec.lang, region: spec.region })
    }
    const failures = results.filter(r => !r.ok)
    const ids = results.map(r => r.campaignId).filter(Boolean) as string[]
    if (!ids.length) return { ok: false, error: failures[0]?.error || 'No regional campaigns were created.', render: { results } }
    const hasQueuedVideo = results.some(r => r.render?.ok)
    const dispatch = hasQueuedVideo ? await dispatchVideoWorker() : { ok: true, skipped: true }
    return {
      ok: failures.length === 0,
      campaignId: ids[0],
      campaignIds: ids,
      status: failures.length ? 'partial' : 'rendering',
      render: { regionalBatch: true, created: ids.length, failed: failures.length, results, dispatch },
      error: failures.length ? `${failures.length} regional campaign(s) failed to create.` : undefined,
    }
  }

  const result = await createOneCampaign(admin, args)
  if (!result.ok) return { ok: false, error: result.error }
  const dispatch = result.render?.ok ? await dispatchVideoWorker() : { ok: true, skipped: true }
  return {
    ok: true,
    campaignId: result.campaignId,
    status: result.render?.ok ? 'rendering' : 'created',
    render: result.render ? { ...result.render, dispatch } : result.render,
  }
}
