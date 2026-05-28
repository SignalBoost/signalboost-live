import { routeIntent } from '@/lib/ai/intentRouter'
import { runGlobalKnowledgeMode, runLocalKnowledgeMode } from '@/lib/ai/modes'
import { OperatorPlan, WikiContentItem, newId } from './store'

const WEBSITE_HINTS = ['website', 'homepage', 'landing', 'restaurant', 'real estate', 'colors', 'button', 'reservation', 'polish', 'portuguese']

export function isUnclearRequest(input: string) {
  const trimmed = input.trim().toLowerCase()
  if (trimmed.length < 12) return true
  return !WEBSITE_HINTS.some(word => trimmed.includes(word))
}

// Pick likely file targets from the request
function guessFileTargets(request: string): string[] {
  const lower = request.toLowerCase()
  const files = ['saas/app/dashboard/builder/page.tsx', 'saas/public/i18n/en.json']
  if (lower.includes('podcast')) files.push('saas/app/podcasters/page.tsx')
  if (lower.includes('video')) files.push('saas/app/dashboard/video/page.tsx')
  if (lower.includes('polish') || lower.includes('portuguese') || lower.includes('translate')) {
    files.push('saas/public/i18n/pl.json', 'saas/public/i18n/pt.json')
  }
  return Array.from(new Set(files))
}

const SUPPORTED_LANGS = ['en', 'pt', 'es', 'pl', 'ru'] as const
type SupportedLang = typeof SUPPORTED_LANGS[number]

function normalizeLanguage(language?: string): SupportedLang {
  const lower = (language || '').trim().toLowerCase()
  if (lower.startsWith('pt')) return 'pt'
  if (lower.startsWith('es')) return 'es'
  if (lower.startsWith('pl')) return 'pl'
  if (lower.startsWith('ru')) return 'ru'
  return 'en'
}

const TEMPLATE_COPY: Record<SupportedLang, {
  clarification: string
  summaryVisual: string
  summaryDefault: string
  steps: string[]
  preview: string[]
}> = {
  en: {
    clarification: 'Could you share the page you want me to update first (for example: homepage, podcasters, or builder)?',
    summaryVisual: 'I will first prepare a visual concept update, then apply focused content and layout updates using SignalBoost tools.',
    summaryDefault: 'I will apply a focused product update in small, safe steps with approval before publish.',
    steps: ['Understand your goal in plain language.', 'Inspect the most relevant page files and translation files.', 'Prepare a visual-first update plan (for website requests) or a focused feature plan.', 'Show you exactly what will change and ask for approval.', 'Apply the approved update, publish it, and keep rollback ready.'],
    preview: ['Friendly UI update aligned with your requested style and goals.', 'Content/button/layout updates in the relevant page.', 'Language updates for translated versions when requested.'],
  },
  pt: {
    clarification: 'Você pode me dizer qual página quer atualizar primeiro (por exemplo: homepage, podcasters ou builder)?',
    summaryVisual: 'Vou preparar primeiro uma proposta visual e depois aplicar ajustes focados de conteúdo e layout com as ferramentas da SignalBoost.',
    summaryDefault: 'Vou aplicar uma atualização focada do produto em etapas pequenas e seguras, com aprovação antes da publicação.',
    steps: ['Entender seu objetivo em linguagem simples.', 'Inspecionar os arquivos de página e de tradução mais relevantes.', 'Montar um plano visual (para pedidos de site) ou um plano de funcionalidade focado.', 'Mostrar exatamente o que vai mudar e pedir sua aprovação.', 'Aplicar a atualização aprovada, publicar e manter rollback pronto.'],
    preview: ['Atualização de interface alinhada ao estilo e objetivo que você pediu.', 'Ajustes de conteúdo/botões/layout na página relevante.', 'Atualizações de idioma para versões traduzidas quando solicitado.'],
  },
  es: {
    clarification: '¿Puedes decirme qué página quieres que actualice primero (por ejemplo: homepage, podcasters o builder)?',
    summaryVisual: 'Primero prepararé una propuesta visual y luego aplicaré ajustes enfocados de contenido y diseño con las herramientas de SignalBoost.',
    summaryDefault: 'Aplicaré una actualización enfocada del producto en pasos pequeños y seguros, con aprobación antes de publicar.',
    steps: ['Entender tu objetivo en lenguaje simple.', 'Revisar los archivos de página y traducción más relevantes.', 'Preparar un plan visual (para solicitudes de sitio web) o un plan de funcionalidad enfocado.', 'Mostrarte exactamente qué cambiará y pedir tu aprobación.', 'Aplicar la actualización aprobada, publicarla y mantener rollback listo.'],
    preview: ['Actualización de UI alineada con el estilo y objetivo solicitado.', 'Ajustes de contenido/botones/diseño en la página relevante.', 'Actualizaciones de idioma para versiones traducidas cuando se solicite.'],
  },
  pl: {
    clarification: 'Czy możesz podać, którą stronę mam najpierw zaktualizować (np. homepage, podcasters albo builder)?',
    summaryVisual: 'Najpierw przygotuję koncepcję wizualną, a potem wdrożę precyzyjne zmiany treści i układu narzędziami SignalBoost.',
    summaryDefault: 'Wprowadzę ukierunkowaną aktualizację produktu małymi, bezpiecznymi krokami z akceptacją przed publikacją.',
    steps: ['Zrozumieć Twój cel prostym językiem.', 'Sprawdzić najważniejsze pliki strony i tłumaczeń.', 'Przygotować plan wizualny (dla próśb o stronę) albo plan funkcjonalny.', 'Pokazać dokładnie, co się zmieni, i poprosić o akceptację.', 'Wdrożyć zaakceptowaną zmianę, opublikować i utrzymać gotowy rollback.'],
    preview: ['Przyjazna aktualizacja UI zgodna z Twoim stylem i celem.', 'Zmiany treści/przycisków/układu na właściwej stronie.', 'Aktualizacje językowe dla tłumaczonych wersji, gdy są wymagane.'],
  },
  ru: {
    clarification: 'Подскажите, какую страницу нужно обновить первой (например: homepage, podcasters или builder)?',
    summaryVisual: 'Сначала подготовлю визуальную концепцию, затем внесу точечные изменения контента и структуры с помощью инструментов SignalBoost.',
    summaryDefault: 'Я выполню целевое обновление продукта небольшими и безопасными шагами с согласованием перед публикацией.',
    steps: ['Понять вашу цель простым языком.', 'Проверить наиболее важные файлы страниц и переводов.', 'Подготовить визуальный план (для запросов по сайту) или сфокусированный план по функции.', 'Показать вам, что именно изменится, и запросить одобрение.', 'Применить одобренные изменения, опубликовать и сохранить возможность отката.'],
    preview: ['Понятное обновление интерфейса в вашем стиле и под вашу цель.', 'Изменения контента/кнопок/макета на нужной странице.', 'Языковые обновления для переводов, если они нужны.'],
  },
}

// ── Real-world content detection ──────────────────────────────────────────────
// Keywords that signal the user wants a site populated with real-world entities
const REAL_WORLD_KEYWORDS = [
  'churches', 'church', 'museums', 'museum', 'restaurants', 'restaurant',
  'hotels', 'hotel', 'beaches', 'beach', 'landmarks', 'landmark',
  'monuments', 'monument', 'cities', 'city', 'countries', 'country',
  'teams', 'team', 'players', 'player', 'artists', 'artist',
  'scientists', 'scientist', 'inventors', 'inventor', 'parks', 'park',
  'universities', 'university', 'hospitals', 'hospital', 'mountains',
  'waterfalls', 'lakes', 'rivers', 'buildings', 'skyscrapers',
  'igrejas', 'museus', 'praias', 'times', 'cidades', // Portuguese
  'iglesias', 'playas', 'equipos', 'ciudades', // Spanish
  'kościoły', 'muzea', 'plaże', 'drużyny', // Polish
  'церкви', 'музеи', 'пляжи', 'команды', // Russian
]

const CONTENT_INTENT_KEYWORDS = [
  'best', 'top', 'most', 'famous', 'beautiful', 'greatest', 'list',
  'world', 'global', 'all', 'popular', 'known', 'historic', 'ancient',
  'melhores', 'mais', 'famosas', 'mundiais', // Portuguese
  'mejores', 'más', 'famosas', 'mundiales', // Spanish
  'najlepsze', 'słynne', 'światowe', // Polish
  'лучшие', 'известные', 'мировые', // Russian
]

function detectsRealWorldContent(request: string): boolean {
  const lower = request.toLowerCase()
  const hasRealWorldTopic = REAL_WORLD_KEYWORDS.some(kw => lower.includes(kw))
  const hasContentIntent = CONTENT_INTENT_KEYWORDS.some(kw => lower.includes(kw))
  return hasRealWorldTopic && hasContentIntent
}

// Extract a clean English search query from the user's request
function extractSearchQuery(request: string): string {
  const lower = request.toLowerCase()

  // Strip common site-building prefixes and extract the topic
  const stripped = lower
    .replace(/build\s+(me\s+)?a\s+site\s+(about|on|for|with|showing|listing|featuring)?/gi, '')
    .replace(/create\s+(me\s+)?a\s+(website|site|page)\s+(about|on|for|with|showing|listing|featuring)?/gi, '')
    .replace(/make\s+(me\s+)?a\s+(website|site|page)\s+(about|on|for|with|showing|listing|featuring)?/gi, '')
    .replace(/i\s+want\s+a\s+(website|site|page)\s+(about|on|for|with)?/gi, '')
    .replace(/quero\s+(um\s+)?site\s+(sobre|com|de)?/gi, '')
    .replace(/criar?\s+(um\s+)?site\s+(sobre|com|de)?/gi, '')
    .replace(/crea[r]?\s+(un\s+)?sitio\s+(sobre|con|de)?/gi, '')
    .replace(/stwórz\s+(mi\s+)?stronę\s+(o|na|dla)?/gi, '')
    .replace(/создай\s+(мне\s+)?сайт\s+(о|про|для)?/gi, '')
    .replace(/and\s+(put|add|save|store|insert)\s+(it|them|the\s+data)?\s+(in|into|to)\s+(the\s+)?(database|db|supabase).*/gi, '')
    .replace(/coloque\s+(no|na)\s+banco\s+de\s+dados.*/gi, '')
    .replace(/coloca[r]?\s+(en|al)\s+(la\s+)?base\s+de\s+datos.*/gi, '')
    .trim()

  // Return the cleaned query, falling back to the original if stripping removed too much
  return stripped.length > 5 ? stripped.trim() : request.trim()
}

// ── Safe fallback ─────────────────────────────────────────────────────────────
function templatePlan(request: string, language?: string): OperatorPlan {
  const lower = request.toLowerCase()
  const visualFirst = lower.includes('website') || lower.includes('homepage') || lower.includes('restaurant') || lower.includes('real estate')
  const selectedLang = normalizeLanguage(language)
  const copy = TEMPLATE_COPY[selectedLang]
  return {
    id: newId('plan'),
    request,
    clarificationQuestion: isUnclearRequest(request) ? copy.clarification : undefined,
    summary: visualFirst ? copy.summaryVisual : copy.summaryDefault,
    steps: copy.steps,
    fileTargets: guessFileTargets(request),
    preview: copy.preview,
    requiresApproval: true,
    createdAt: new Date().toISOString(),
  }
}

// ── Call Claude ───────────────────────────────────────────────────────────────
async function callClaude(systemPrompt: string, userContent: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    })
    if (!response.ok) {
      const errorBody = await response.text()
      console.error('Operator planner Anthropic:', response.status, errorBody)
      return null
    }
    const data = await response.json()
    return data.content?.[0]?.text || ''
  } catch (err) {
    console.error('Operator planner Claude error', err)
    return null
  }
}

const SYSTEM_PROMPT = `You are the SignalBoost AI Operator — an expert product and web consultant.
A user describes something they want to create or change. You produce a clear, SPECIFIC plan for THEIR request.

LANGUAGE (MOST IMPORTANT RULE):
- Detect the language the user wrote their request in.
- Write EVERY text value (summary, steps, preview, clarificationQuestion) in that SAME language.
- If the user wrote in Portuguese, reply entirely in Brazilian Portuguese. Spanish -> Spanish. Polish -> Polish. Russian -> Russian. English -> English.

WHAT TO PRODUCE:
- A real plan tailored to the user's actual idea — not a generic template. Reference what they actually described.
- Be concrete and encouraging, like a senior consultant who understands their business goal.
- If REAL_WORLD_DATA is provided below, reference the actual items by name in the preview — tell the user their site will feature those specific real places/things.

OUTPUT FORMAT (STRICT):
Respond with ONLY a valid JSON object, no markdown, no backticks, no text before or after. Exactly this shape:
{
  "summary": "one or two sentences describing how you will approach THEIR specific request, in the user's language",
  "steps": ["4 to 6 concrete steps, each a short string, in the user's language"],
  "preview": ["2 to 4 short strings describing what they will get, in the user's language"],
  "clarificationQuestion": "if their request is missing key non-technical info you genuinely need, ask ONE short question in their language; otherwise use an empty string"
}

RULES:
- JSON must be valid: double quotes, no trailing commas.
- Do not invent SignalBoost features that do not exist (websites, reviews, native audio, video captions/clips, podcast tools, promotion campaigns, prospect outreach).
- Keep each string concise.
- clarificationQuestion must be a string (use "" if none).`

// ── Main export ───────────────────────────────────────────────────────────────
export async function buildPlan(request: string, language?: string): Promise<OperatorPlan> {
  const requestedLanguage = (language || '').trim().toLowerCase()

  // ── Step 1: Detect if this request needs orchestrated AI data ─────────────
  let contentData: WikiContentItem[] | undefined
  let contentQuery: string | undefined
  const routedIntent = routeIntent({ userPrompt: request, language })

  if (routedIntent.intent === 'local_knowledge') {
    contentQuery = request
    console.log('Operator: local content detected, using AI orchestration:', contentQuery)
    const items = await runLocalKnowledgeMode({ userPrompt: request, language: routedIntent.language, count: 20 })
    if (items.length > 0) {
      contentData = items.slice(0, 10).map(item => ({
        title: item.name,
        description: [item.neighborhood, item.zone, item.description].filter(Boolean).join(' — '),
        image_url: null,
        wiki_url: `local-knowledge://${encodeURIComponent(item.name)}`,
      }))
      console.log(`Operator: enriched plan with ${contentData.length} local AI items`)
    }
  } else if (routedIntent.intent === 'global_knowledge' || detectsRealWorldContent(request)) {
    contentQuery = extractSearchQuery(request)
    console.log('Operator: global content detected, using AI orchestration:', contentQuery)
    const knowledge = await runGlobalKnowledgeMode({ userPrompt: contentQuery, language: routedIntent.language })
    const entities = knowledge.related_entities.length > 0 ? knowledge.related_entities : [knowledge.topic]
    contentData = entities.slice(0, 10).map((entity, index) => ({
      title: entity,
      description: index === 0 ? knowledge.summary : knowledge.key_points[index - 1] || knowledge.summary,
      image_url: null,
      wiki_url: `global-knowledge://${encodeURIComponent(entity)}`,
    }))
    console.log(`Operator: enriched plan with ${contentData.length} global AI entities`)
  }

  // ── Step 2: Build the Claude prompt, injecting real data if available ─────
  const languageDirective = requestedLanguage
    ? `\n\nSELECTED LANGUAGE OVERRIDE:\n- The app-selected language is "${requestedLanguage}".\n- You MUST respond entirely in this selected language, even if the user's request text is in a different language.`
    : ''

  const dataDirective = contentData && contentData.length > 0
    ? `\n\nAI_ORCHESTRATION_DATA (generated by the intent router for this request):\n${contentData
        .slice(0, 6)
        .map((item, i) => `${i + 1}. ${item.title}${item.description ? ': ' + item.description.slice(0, 120) : ''}`)
        .join('\n')}\n\nIMPORTANT: The site will be populated with these real items. Reference them by name in your preview strings so the user knows their site will feature orchestrated AI content, not placeholders.`
    : ''

  const raw = await callClaude(
    `${SYSTEM_PROMPT}${languageDirective}${dataDirective}`,
    request,
  )

  if (!raw) return { ...templatePlan(request, language), contentData, contentQuery }

  // ── Step 3: Parse Claude's response ──────────────────────────────────────
  let parsed: any = null
  try {
    const firstBrace = raw.indexOf('{')
    const lastBrace  = raw.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1))
    }
  } catch {
    parsed = null
  }

  if (!parsed || typeof parsed.summary !== 'string' || !Array.isArray(parsed.steps)) {
    return { ...templatePlan(request, language), contentData, contentQuery }
  }

  const steps   = parsed.steps.filter((s: any) => typeof s === 'string' && s.trim().length > 0)
  const preview = Array.isArray(parsed.preview)
    ? parsed.preview.filter((s: any) => typeof s === 'string' && s.trim().length > 0)
    : []
  const clarification = typeof parsed.clarificationQuestion === 'string'
    ? parsed.clarificationQuestion.trim()
    : ''

  const fallback = templatePlan(request, language)

  return {
    id: newId('plan'),
    request,
    clarificationQuestion: clarification.length > 0 ? clarification : undefined,
    summary: parsed.summary.trim(),
    steps:   steps.length > 0   ? steps   : fallback.steps,
    fileTargets: guessFileTargets(request),
    preview: preview.length > 0 ? preview : fallback.preview,
    requiresApproval: true,
    createdAt: new Date().toISOString(),
    // Real-world content attached to the plan for the apply/render step
    contentData,
    contentQuery,
  }
}
