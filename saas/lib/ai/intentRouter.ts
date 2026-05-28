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

export function detectLanguage(text: string): string {
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
  'restaurante', 'barbearia', 'padaria', 'academia', 'quadra', 'campo', 'igreja',
  'negócio local', 'empresa local', 'pousada', 'bar local', 'mercado', 'feira',
  'são paulo', 'rio de janeiro', 'belo horizonte', 'curitiba', 'salvador', 'fortaleza',
  // English
  'local teams', 'local restaurants', 'local businesses', 'neighborhood',
  'amateur football', 'amateur soccer', 'amateur teams', 'street food', 'local church',
  'small business', 'community', 'district',
  // Spanish
  'barrio', 'zona norte', 'zona sur', 'equipo local', 'restaurante local', 'negocio local',
  // Polish
  'dzielnica', 'lokalne', 'amatorski', 'lokalna drużyna',
  // Russian
  'район', 'местные', 'любительский', 'местная команда',
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
  'louvre', 'museu do louvre', 'torre eiffel', 'eiffel', 'colosseum', 'coliseu', 'machu picchu', 'great wall', 'taj mahal',
  'buckingham', 'vatican', 'vaticano', 'kremlin', 'white house', 'casa branca',
  // Scopes
  'world famous', 'famoso no mundo', 'famosos do mundo', 'most famous in the world',
  'globally', 'worldwide', 'international', 'internacional',
  'countries', 'country', 'países', 'pais', 'continents', 'continentes',
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

  const priority: IntentType[] = ['local_knowledge', 'creative', 'global_knowledge', 'business']
  const [intent, topScore] = (Object.entries(scores) as [IntentType, number][])
    .sort(([intentA, scoreA], [intentB, scoreB]) => {
      if (scoreB !== scoreA) return scoreB - scoreA
      return priority.indexOf(intentA) - priority.indexOf(intentB)
    })[0]

  // Default to business if no strong signal
  if (topScore === 0) {
    return {
      intent:     'business',
      language,
      userPrompt: text,
      confidence: 0.5,
      reason:     'No strong intent signal — defaulting to business mode',
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
