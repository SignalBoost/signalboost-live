// saas/lib/ai/intentRouter.ts
// Central brain — classifies every user prompt into one of 4 intents.

export type IntentType =
  | 'local_knowledge'
  | 'business'
  | 'creative'
  | 'global_knowledge'

export interface RoutedIntent {
  intent:     IntentType
  language:   string
  userPrompt: string
  confidence: number
  reason:     string
}

// ── Language detection (heuristic) ────────────────────────────────────────────

const LANG_PATTERNS: Record<string, RegExp> = {
  pt: /\b(de|da|do|em|um|uma|que|não|com|para|como|site|negócio|bairro|time|equipe|futebol|várzea|restaurante|melhores|famosos|mundo|criar|gere|faça|mostre)\b/i,
  es: /\b(de|la|el|en|un|una|que|no|con|para|cómo|sitio|negocio|barrio|equipo|fútbol|restaurante|mejores|famosos|mundo|crear|generar|mostrar)\b/i,
  pl: /\b(że|nie|się|jak|jest|dla|przez|który|można|strona|biznes|dzielnica|drużyna|piłka|restauracja|najlepsze|słynne|świat|stwórz|wygeneruj)\b/i,
  ru: /\b(не|для|как|это|что|сайт|бизнес|район|команда|футбол|ресторан|лучших|знаменитых|мир|создай|сгенерируй|покажи)\b/i,
}

// Japanese, Korean and Arabic are identified by script. Japanese needs kana: kanji
// alone is shared with Chinese and is not evidence of Japanese.
const SCRIPT_PATTERNS: Array<[string, RegExp]> = [
  ['ja', /[\u3040-\u30ff]/],
  ['ko', /[\uac00-\ud7af]/],
  ['ar', /[\u0600-\u06ff]/],
]

// German, French and Italian share short function words with Portuguese and Spanish
// (de, da, um, que, con), so the first-match patterns above would claim them. They are
// checked first, and only on TWO distinct words that Portuguese, Spanish and English
// do not use, so a genuine pt/es/en prompt is never re-labelled.
const LATIN_MARKERS: Array<[string, RegExp]> = [
  ['de', /(?<!\p{L})(und|der|die|das|nicht|ist|ich|mit|für|eine|einen|auf|wie|über|erstelle|erstellen|zeige|besten|berühmte|mannschaft|webseite|unternehmen|stadtteil)(?!\p{L})/giu],
  ['fr', /(?<!\p{L})(des|est|et|une|pour|avec|dans|pas|vous|nous|créer|crée|meilleurs|meilleures|célèbres|équipe|quartier|entreprise)(?!\p{L})/giu],
  ['it', /(?<!\p{L})(il|gli|della|delle|degli|dei|che|sono|questo|questa|creare|mostra|migliori|famosi|squadra|quartiere|sito|azienda)(?!\p{L})/giu],
]

function distinctMatches(text: string, pattern: RegExp): number {
  return new Set((text.toLowerCase().match(pattern) || [])).size
}

export function detectLanguage(text: string): string {
  for (const [lang, pattern] of SCRIPT_PATTERNS) {
    if (pattern.test(text)) return lang
  }
  for (const [lang, pattern] of LATIN_MARKERS) {
    if (distinctMatches(text, pattern) >= 2) return lang
  }
  for (const [lang, pattern] of Object.entries(LANG_PATTERNS)) {
    if (pattern.test(text)) return lang
  }
  return 'en'
}

// ── Intent classification rules ────────────────────────────────────────────────

const LOCAL_KEYWORDS = [
  // Portuguese
  'bairro', 'zona norte', 'zona sul', 'zona leste', 'zona oeste', 'zn', 'zs', 'zl', 'zo',
  'várzea', 'varzea', 'futebol amador', 'time de', 'equipe de', 'clube de',
  'restaurante', 'barbearia', 'padaria', 'academia', 'quadra', 'campo', 'igreja local',
  'negócio local', 'empresa local', 'pousada', 'bar local', 'mercado', 'feira',
  'são paulo', 'rio de janeiro', 'belo horizonte', 'curitiba', 'salvador', 'fortaleza',
  // English
  'local teams', 'local restaurants', 'local businesses', 'neighborhood',
  'amateur football', 'amateur soccer', 'amateur teams', 'street food', 'local church',
  'small business', 'community', 'district',
  // Spanish
  'barrio', 'zona norte', 'equipo local', 'restaurante local', 'negocio local',
  // Polish
  'dzielnica', 'lokalne', 'amatorski', 'lokalna drużyna',
  // Russian
  'район', 'местные', 'любительский', 'местная команда',
  // German
  'stadtteil', 'viertel', 'lokale', 'amateur', 'lokale mannschaft',
  // French
  'quartier', 'locaux', 'locales', 'amateur', 'équipe locale',
  // Italian
  'quartiere', 'locali', 'dilettanti', 'squadra locale',
  // Japanese
  '地元', '近所', 'アマチュア', '地域',
  // Korean
  '동네', '지역', '아마추어', '지역 팀',
  // Arabic
  'الحي', 'محلي', 'محلية', 'هواة', 'فريق محلي',
]

const BUSINESS_KEYWORDS = [
  'site', 'website', 'landing page', 'página', 'página web',
  'negócio', 'negocio', 'serviço', 'servicio', 'service',
  'clientes', 'clients', 'customers', 'preços', 'prices', 'precio',
  'planos', 'plans', 'faq', 'contato', 'contact', 'contacto',
  'vendas', 'sales', 'ventas', 'empresa', 'company', 'business',
  'portfolio', 'portfólio', 'freelancer', 'consultor', 'consultant',
  'loja', 'store', 'tienda', 'shop', 'ecommerce', 'e-commerce',
]

const CREATIVE_KEYWORDS = [
  'história', 'historia', 'story', 'ficção', 'ficcion', 'fiction',
  'fantasia', 'fantasy', 'personagem', 'character', 'personaje',
  'mundo imaginário', 'imaginary world', 'universo fictício', 'fictional universe',
  'time fictício', 'fictional team', 'equipo ficticio', 'inventar', 'invent', 'criar ficção',
  'conto', 'tale', 'narrativa', 'narrative', 'rpg', 'game world', 'lore',
]

const GLOBAL_KEYWORDS = [
  // Landmarks / institutions
  'louvre', 'eiffel', 'colosseum', 'coliseu', 'machu picchu', 'great wall', 'taj mahal',
  'buckingham', 'vatican', 'vaticano', 'kremlin', 'white house', 'casa branca',
  // Scopes
  'world famous', 'famoso no mundo', 'famosos do mundo', 'most famous in the world',
  'globally', 'worldwide', 'international', 'internacional',
  'countries', 'países', 'continents', 'continentes',
  'top 10 world', 'top 10 mundial', 'best in the world', 'melhores do mundo',
  // Famous category + world
  'famous museums', 'museus famosos', 'world museums', 'museus do mundo',
  'famous churches', 'igrejas famosas', 'world churches',
  'famous beaches', 'praias famosas', 'world beaches',
  // Regions
  'eua', 'usa', 'europe', 'europa', 'asia', 'ásia', 'africa', 'áfrica',
]

function scoreKeywords(text: string, keywords: string[]): number {
  const lower = text.toLowerCase()
  return keywords.filter(kw => lower.includes(kw.toLowerCase())).length
}

// ── Main routing function ─────────────────────────────────────────────────────

export function routeIntent(input: {
  userPrompt: string
  language?:  string
  context?:   unknown
}): RoutedIntent {
  const text     = input.userPrompt.trim()
  const language = input.language || detectLanguage(text)

  const scores = {
    local_knowledge:  scoreKeywords(text, LOCAL_KEYWORDS),
    business:         scoreKeywords(text, BUSINESS_KEYWORDS),
    creative:         scoreKeywords(text, CREATIVE_KEYWORDS),
    global_knowledge: scoreKeywords(text, GLOBAL_KEYWORDS),
  }

  console.log('intentRouter: scores', scores)

  const topIntent = (Object.entries(scores) as [IntentType, number][])
    .sort(([, a], [, b]) => b - a)[0]

  const [intent, topScore] = topIntent

  // Unmatched prompts are ordinary general requests, not implicit business intent.
  if (topScore === 0) {
    return {
      intent:     'global_knowledge',
      language,
      userPrompt: text,
      confidence: 0.5,
      reason:     'No product-specific intent signal — defaulting to general knowledge mode',
    }
  }

  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0)
  const confidence = totalScore > 0 ? Math.min(0.95, topScore / totalScore + 0.3) : 0.5

  const reasons: Record<IntentType, string> = {
    local_knowledge:  'Local keywords detected (neighborhood, city, local teams/businesses)',
    business:         'Business keywords detected (site, services, pricing, contact)',
    creative:         'Creative keywords detected (fiction, story, characters, world)',
    global_knowledge: 'Global keywords detected (world famous, countries, landmarks)',
  }

  return {
    intent,
    language,
    userPrompt: text,
    confidence,
    reason: reasons[intent],
  }
}
