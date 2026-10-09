// saas/lib/operator/planner.ts
import { OperatorPlan, WikiContentItem, newId } from './store.ts'
import { PUBLIC_BRAND } from '@/lib/public-brand'

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

const SUPPORTED_LANGS = ['en', 'pt', 'es', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar'] as const
type SupportedLang = typeof SUPPORTED_LANGS[number]

function normalizeLanguage(language?: string): SupportedLang {
  const lower = (language || '').trim().toLowerCase()
  if (lower.startsWith('pt')) return 'pt'
  if (lower.startsWith('es')) return 'es'
  if (lower.startsWith('pl')) return 'pl'
  if (lower.startsWith('ru')) return 'ru'
  if (lower.startsWith('de')) return 'de'
  if (lower.startsWith('fr')) return 'fr'
  if (lower.startsWith('it')) return 'it'
  if (lower.startsWith('ja')) return 'ja'
  if (lower.startsWith('ko')) return 'ko'
  if (lower.startsWith('ar')) return 'ar'
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
  de: {
    clarification: 'Welche Seite soll ich zuerst aktualisieren (zum Beispiel: Startseite, Podcaster oder Builder)?',
    summaryVisual: 'Ich erstelle zunächst ein visuelles Konzept-Update und wende dann gezielte Inhalts- und Layout-Änderungen mit den SignalBoost-Tools an.',
    summaryDefault: 'Ich setze ein gezieltes Produkt-Update in kleinen, sicheren Schritten um – mit Freigabe vor der Veröffentlichung.',
    steps: ['Ihr Ziel in einfacher Sprache verstehen.', 'Die relevantesten Seiten- und Übersetzungsdateien prüfen.', 'Einen visuell orientierten Update-Plan (für Website-Anfragen) oder einen gezielten Funktionsplan erstellen.', 'Ihnen genau zeigen, was sich ändert, und um Freigabe bitten.', 'Das freigegebene Update anwenden, veröffentlichen und ein Rollback bereithalten.'],
    preview: ['Benutzerfreundliches UI-Update, abgestimmt auf Ihren gewünschten Stil und Ihre Ziele.', 'Inhalts-/Schaltflächen-/Layout-Updates auf der relevanten Seite.', 'Sprach-Updates für übersetzte Versionen, falls gewünscht.'],
  },
  fr: {
    clarification: 'Quelle page souhaitez-vous que je mette à jour en premier (par exemple : page d’accueil, podcasteurs ou builder) ?',
    summaryVisual: 'Je vais d’abord préparer une proposition visuelle, puis appliquer des modifications ciblées du contenu et de la mise en page avec les outils SignalBoost.',
    summaryDefault: 'J’appliquerai une mise à jour ciblée du produit par petites étapes sûres, avec approbation avant publication.',
    steps: ['Comprendre votre objectif en langage simple.', 'Examiner les fichiers de page et de traduction les plus pertinents.', 'Préparer un plan de mise à jour axé sur le visuel (pour les demandes de site web) ou un plan de fonctionnalité ciblé.', 'Vous montrer exactement ce qui va changer et demander votre approbation.', 'Appliquer la mise à jour approuvée, la publier et garder un retour arrière prêt.'],
    preview: ['Mise à jour conviviale de l’UI, alignée sur le style et les objectifs demandés.', 'Mises à jour du contenu, des boutons et de la mise en page sur la page concernée.', 'Mises à jour linguistiques des versions traduites sur demande.'],
  },
  it: {
    clarification: 'Puoi indicarmi quale pagina vuoi che aggiorni per prima (ad esempio: homepage, podcaster o builder)?',
    summaryVisual: 'Prima preparerò un aggiornamento del concept visivo, poi applicherò modifiche mirate a contenuti e layout con gli strumenti di SignalBoost.',
    summaryDefault: 'Applicherò un aggiornamento mirato del prodotto in piccoli passi sicuri, con approvazione prima della pubblicazione.',
    steps: ['Capire il tuo obiettivo in linguaggio semplice.', 'Esaminare i file di pagina e di traduzione più rilevanti.', 'Preparare un piano di aggiornamento incentrato sulla parte visiva (per le richieste relative al sito web) o un piano di funzionalità mirato.', 'Mostrarti esattamente cosa cambierà e chiedere l’approvazione.', 'Applicare l’aggiornamento approvato, pubblicarlo e tenere pronto il rollback.'],
    preview: ['Aggiornamento dell’UI intuitivo, in linea con lo stile e gli obiettivi richiesti.', 'Aggiornamenti di contenuti/pulsanti/layout nella pagina pertinente.', 'Aggiornamenti linguistici per le versioni tradotte, se richiesti.'],
  },
  ja: {
    clarification: '最初に更新するページを教えていただけますか(例:ホームページ、ポッドキャスター、ビルダー)?',
    summaryVisual: 'まずビジュアルコンセプトの更新案を作成し、その後 SignalBoost のツールを使ってコンテンツとレイアウトを重点的に更新します。',
    summaryDefault: '製品の重点的な更新を小さく安全なステップで適用し、公開前に承認をいただきます。',
    steps: ['目標をわかりやすい言葉で把握します。', '最も関連性の高いページファイルと翻訳ファイルを確認します。', 'ビジュアル重視の更新プラン(ウェブサイトのリクエストの場合)または重点的な機能プランを作成します。', '変更内容を正確にお見せし、承認をお願いします。', '承認された更新を適用して公開し、ロールバックを準備しておきます。'],
    preview: ['ご希望のスタイルと目標に沿った、使いやすい UI の更新。', '該当ページのコンテンツ/ボタン/レイアウトの更新。', 'ご要望に応じた翻訳版の言語更新。'],
  },
  ko: {
    clarification: '먼저 업데이트할 페이지를 알려 주시겠어요? (예: 홈페이지, 팟캐스터, 빌더)',
    summaryVisual: '먼저 시각적 콘셉트 업데이트를 준비한 다음, SignalBoost 도구를 사용해 콘텐츠와 레이아웃을 집중적으로 업데이트하겠습니다.',
    summaryDefault: '작고 안전한 단계로 제품 업데이트를 집중 적용하고, 게시 전에 승인을 받겠습니다.',
    steps: ['목표를 쉬운 말로 파악합니다.', '가장 관련성 높은 페이지 파일과 번역 파일을 검토합니다.', '시각 중심 업데이트 계획(웹사이트 요청의 경우) 또는 집중 기능 계획을 준비합니다.', '변경될 내용을 정확히 보여 드리고 승인을 요청합니다.', '승인된 업데이트를 적용하고 게시하며, 롤백을 준비해 둡니다.'],
    preview: ['요청하신 스타일과 목표에 맞춘 사용자 친화적인 UI 업데이트.', '관련 페이지의 콘텐츠/버튼/레이아웃 업데이트.', '요청 시 번역본의 언어 업데이트.'],
  },
  ar: {
    clarification: 'هل يمكنك تحديد الصفحة التي تريد أن أحدّثها أولاً (مثل: الصفحة الرئيسية أو صفحة مقدمي البودكاست أو المُنشئ)؟',
    summaryVisual: 'سأُعدّ أولاً تحديثًا للمفهوم المرئي، ثم أطبّق تحديثات مركّزة على المحتوى والتخطيط باستخدام أدوات SignalBoost.',
    summaryDefault: 'سأطبّق تحديثًا مركّزًا للمنتج على خطوات صغيرة وآمنة، مع الحصول على الموافقة قبل النشر.',
    steps: ['فهم هدفك بلغة بسيطة.', 'فحص ملفات الصفحات وملفات الترجمة الأكثر صلة.', 'إعداد خطة تحديث تركّز على الجانب المرئي (لطلبات المواقع الإلكترونية) أو خطة ميزة مركّزة.', 'عرض ما سيتغير بدقة وطلب موافقتك.', 'تطبيق التحديث المعتمد ونشره مع إبقاء إمكانية التراجع جاهزة.'],
    preview: ['تحديث سهل الاستخدام لواجهة المستخدم يتوافق مع النمط والأهداف التي طلبتها.', 'تحديثات المحتوى/الأزرار/التخطيط في الصفحة المعنية.', 'تحديثات لغوية للنسخ المترجمة عند الطلب.'],
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
  'kirchen', 'museen', 'strände', 'mannschaften', 'städte', // German
  'églises', 'musées', 'plages', 'équipes', 'villes', // French
  'chiese', 'musei', 'spiagge', 'squadre', 'città', // Italian
  '教会', '博物館', '美術館', 'ビーチ', 'チーム', '都市', // Japanese
  '교회', '박물관', '해변', '도시', // Korean
  'كنائس', 'متاحف', 'شواطئ', 'مدن', // Arabic
]

const CONTENT_INTENT_KEYWORDS = [
  'best', 'top', 'most', 'famous', 'beautiful', 'greatest', 'list',
  'world', 'global', 'all', 'popular', 'known', 'historic', 'ancient',
  'melhores', 'mais', 'famosas', 'mundiais', // Portuguese
  'mejores', 'más', 'famosas', 'mundiales', // Spanish
  'najlepsze', 'słynne', 'światowe', // Polish
  'лучшие', 'известные', 'мировые', // Russian
  'beste', 'berühmte', 'schönste', 'weltweit', // German
  'meilleurs', 'meilleures', 'célèbres', 'mondiaux', // French
  'migliori', 'famosi', 'famose', 'mondiali', // Italian
  '最高', '有名', '世界', '人気', // Japanese
  '최고', '유명한', '세계', '인기', // Korean
  'أفضل', 'أشهر', 'أجمل', 'العالم', // Arabic
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
    .replace(/erstelle\s+(mir\s+)?eine\s+(website|webseite|seite)\s+(über|zu|für|mit)?/gi, '')
    .replace(/crée[rz]?(\s*-?\s*moi)?\s+un\s+site\s+(sur|avec|de|pour)?/gi, '')
    .replace(/crea(re|mi)?\s+un\s+sito\s+(sugli|sulle|sui|sul|su|con|di|per)?/gi, '')
    .replace(/(について|に関する)の?(ウェブ)?サイトを(作って|作成して)(ください)?/g, '')
    .replace(/에\s*(대한|관한)\s*(웹)?사이트를?\s*(만들어\s*줘|만들어\s*주세요)?/g, '')
    .replace(/(أنشئ|اصنع)\s+(لي\s+)?موقع[اًا]*\s+(عن|حول)?/g, '')
    .replace(/and\s+(put|add|save|store|insert)\s+(it|them|the\s+data)?\s+(in|into|to)\s+(the\s+)?(database|db|supabase).*/gi, '')
    .replace(/coloque\s+(no|na)\s+banco\s+de\s+dados.*/gi, '')
    .replace(/coloca[r]?\s+(en|al)\s+(la\s+)?base\s+de\s+datos.*/gi, '')
    .replace(/und\s+(speichere|lege)\s+(es|sie|die\s+daten)?\s*in\s+(der|die)\s+datenbank.*/gi, '')
    .replace(/et\s+(mets|enregistre|ajoute)[sz]?(-les|-le)?\s+(dans|en)\s+(la\s+)?base\s+de\s+données.*/gi, '')
    .replace(/e\s+(mettil[oie]|salval[oie]|inseriscil[oie])\s+nel\s+database.*/gi, '')
    .trim()

  // Return the cleaned query, falling back to the original if stripping removed too much
  return stripped.length > 5 ? stripped.trim() : request.trim()
}

// ── Wikipedia fetch (server-side, no CORS origin param) ──────────────────────
const WIKI_API   = 'https://en.wikipedia.org/w/api.php'
const USER_AGENT = `${PUBLIC_BRAND.name}/1.0 (${PUBLIC_BRAND.siteUrl}; support@signalboostapp.com)`

async function fetchWikipediaEnrichment(query: string): Promise<WikiContentItem[]> {
  try {
    // Step 1: search
    const searchParams = new URLSearchParams({
      action: 'query', list: 'search', srsearch: query,
      srlimit: '8', format: 'json',
    })
    const searchRes = await fetch(`${WIKI_API}?${searchParams}`, {
      headers: { 'User-Agent': USER_AGENT },
    })
    if (!searchRes.ok) return []
    const searchData = await searchRes.json()
    const pageIds: number[] = (searchData?.query?.search ?? []).map((r: { pageid: number }) => r.pageid)
    if (pageIds.length === 0) return []

    // Step 2: fetch page details
    const detailParams = new URLSearchParams({
      action: 'query', pageids: pageIds.join('|'),
      prop: 'extracts|pageimages|info',
      exintro: 'true', explaintext: 'true', exsentences: '2',
      piprop: 'original', inprop: 'url', format: 'json',
    })
    const detailRes = await fetch(`${WIKI_API}?${detailParams}`, {
      headers: { 'User-Agent': USER_AGENT },
    })
    if (!detailRes.ok) return []
    const detailData = await detailRes.json()
    const pages = Object.values(detailData?.query?.pages ?? {}) as any[]

    return pages
      .filter((p: any) => p.title && p.extract)
      .map((p: any) => ({
        title:       p.title,
        description: p.extract?.trim() ?? null,
        image_url:   p.original?.source ?? null,
        wiki_url:    p.fullurl ?? `https://en.wikipedia.org/?curid=${p.pageid}`,
      }))
  } catch (err) {
    console.error('Operator Wikipedia enrichment error:', err)
    return []
  }
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
- If the user wrote in Portuguese, reply entirely in Brazilian Portuguese. Spanish -> Spanish. Polish -> Polish. Russian -> Russian. German -> German. French -> French. Italian -> Italian. Japanese -> Japanese. Korean -> Korean. Arabic -> Modern Standard Arabic. English -> English.

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

  // ── Step 1: Detect if this request needs real-world data ──────────────────
  let contentData: WikiContentItem[] | undefined
  let contentQuery: string | undefined

  if (detectsRealWorldContent(request)) {
    contentQuery = extractSearchQuery(request)
    console.log('Operator: real-world content detected, fetching Wikipedia for:', contentQuery)
    const fetched = await fetchWikipediaEnrichment(contentQuery)
    if (fetched.length > 0) {
      contentData = fetched
      console.log(`Operator: enriched plan with ${fetched.length} Wikipedia items`)
    }
  }

  // ── Step 2: Build the Claude prompt, injecting real data if available ─────
  const languageDirective = requestedLanguage
    ? `\n\nSELECTED LANGUAGE OVERRIDE:\n- The app-selected language is "${requestedLanguage}".\n- You MUST respond entirely in this selected language, even if the user's request text is in a different language.`
    : ''

  const dataDirective = contentData && contentData.length > 0
    ? `\n\nREAL_WORLD_DATA (fetched automatically from Wikipedia for this request):\n${contentData
        .slice(0, 6)
        .map((item, i) => `${i + 1}. ${item.title}${item.description ? ': ' + item.description.slice(0, 120) : ''}`)
        .join('\n')}\n\nIMPORTANT: The site will be populated with these real items. Reference them by name in your preview strings so the user knows their site will feature actual real-world content, not placeholders.`
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
