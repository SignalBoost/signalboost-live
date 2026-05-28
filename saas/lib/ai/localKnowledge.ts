// saas/lib/ai/localKnowledge.ts
//
// Local Knowledge Engine — prompt builder, topic classifier, and routing logic.
// Determines whether a request needs:
//   - LOCAL mode: Claude's internal knowledge (local teams, restaurants, businesses)
//   - WIKIPEDIA mode: Global famous things (world museums, famous churches)
//   - CREATIVE mode: Fictional or artistic content
//   - BUSINESS mode: Plain business website with no list data needed

// ── Types ─────────────────────────────────────────────────────────────────────

export type GeneratedItem = {
  name:         string
  neighborhood: string
  zone:         string
  founded:      string | null
  colors:       string[]
  description:  string
  image_url:    string | null
  source_url:   string
  metadata:     Record<string, unknown>
}

export type DataMode = 'local_knowledge' | 'wikipedia' | 'creative' | 'business' | 'none'

export type RoutingDecision = {
  mode:         DataMode
  confidence:   number
  category:     string
  localQuery:   string | null
  wikiQuery:    string | null
  reason:       string
}

// ── Local knowledge trigger patterns ─────────────────────────────────────────
// These signal that the user wants LOCAL data Claude knows from training
// (city-specific, neighborhood-level, amateur/informal entities)

const LOCAL_PATTERNS = [
  // Sports / teams
  /\b(v[aá]rzea|amateur|amador|futebol de rua|pelada|campeonato local|liga local)\b/i,
  /\b(times?\s+de\s+|equipes?\s+de\s+|clubes?\s+de\s+)\w+/i,
  /\b(football\s+teams?|soccer\s+teams?|sports?\s+clubs?)\s+(in|from|de|em|da|do)\s+\w+/i,
  // Local restaurants / food
  /\b(restaurantes?\s+(de|em|do|da|no|na)|local\s+restaurants?|neighborhood\s+restaurants?)\b/i,
  /\b(melhores?\s+restaurantes?\s+de\s+|best\s+restaurants?\s+in\s+)\w+/i,
  // Local businesses
  /\b(small\s+businesses?|local\s+businesses?|negócios?\s+locais?|empresas?\s+locais?)\b/i,
  // Neighborhoods / districts
  /\b(bairros?\s+de\s+|neighborhoods?\s+in\s+|districts?\s+of\s+)\w+/i,
  // Explicit local scope
  /\b(local|neighborhood|bairro|cidade|district|zona\s+(norte|sul|leste|oeste|centro))\b/i,
]

// These signal GLOBAL/FAMOUS content → use Wikipedia
const GLOBAL_PATTERNS = [
  /\b(most\s+famous|world['\u2019]?s?\s+(best|most|top)|globally\s+renowned)\b/i,
  /\b(best\s+in\s+the\s+world|top\s+\d+\s+in\s+the\s+world)\b/i,
  /\b(famous\s+(museums?|churches?|landmarks?|monuments?))\b/i,
  /\b(melhores?\s+do\s+mundo|mais\s+famosos?\s+do\s+mundo)\b/i,
  /\b(mejores?\s+del\s+mundo|más\s+famosos?\s+del\s+mundo)\b/i,
]

// Category detection keywords
const CATEGORY_MAP: Record<string, RegExp> = {
  football_teams:  /\b(times?|equipes?|clubes?|teams?|clubs?|futebol|football|soccer|v[aá]rzea)\b/i,
  restaurants:     /\b(restaurantes?|restaurants?|comida|food|cuisine|gastronomia)\b/i,
  neighborhoods:   /\b(bairros?|neighborhoods?|districts?|zonas?)\b/i,
  beaches:         /\b(praias?|beaches?|praia)\b/i,
  museums:         /\b(museus?|museums?)\b/i,
  churches:        /\b(igrejas?|churches?|cathedral|catedral)\b/i,
  universities:    /\b(universidades?|universities?|faculdades?|colleges?)\b/i,
  hotels:          /\b(hot[eé]is?|hotels?|pousadas?|hostels?)\b/i,
  parks:           /\b(parques?|parks?)\b/i,
  businesses:      /\b(empresas?|businesses?|lojas?|stores?|shops?)\b/i,
}

// City/location extraction — look for "de/em/in/from <city>"
function extractLocation(text: string): string | null {
  const patterns = [
    /\bde\s+([A-ZÀ-Ú][a-zà-ú\s]+?)(?:\s*[,.]|\s+que|\s*$)/,
    /\bem\s+([A-ZÀ-Ú][a-zà-ú\s]+?)(?:\s*[,.]|\s+que|\s*$)/,
    /\bin\s+([A-Z][a-z\s]+?)(?:\s*[,.]|\s+that|\s*$)/,
    /\bfrom\s+([A-Z][a-z\s]+?)(?:\s*[,.]|\s+that|\s*$)/,
    /\bdo\s+(s[aã]o\s+paulo|rio\s+de\s+janeiro|belo\s+horizonte|curitiba|salvador|recife|fortaleza)/i,
    /\b(s[aã]o\s+paulo|rio\s+de\s+janeiro|belo\s+horizonte|curitiba|salvador|recife|fortaleza|sp|rj|bh)\b/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1].trim()
  }
  return null
}

function detectCategory(text: string): string {
  for (const [category, pattern] of Object.entries(CATEGORY_MAP)) {
    if (pattern.test(text)) return category
  }
  return 'general'
}

// ── Main routing function ─────────────────────────────────────────────────────

export function routeDataRequest(description: string): RoutingDecision {
  const text = description.trim()

  // Check for global/famous patterns first (they override local)
  const isGlobal = GLOBAL_PATTERNS.some(p => p.test(text))
  if (isGlobal) {
    const category = detectCategory(text)
    return {
      mode:       'wikipedia',
      confidence: 0.85,
      category,
      localQuery: null,
      wikiQuery:  text,
      reason:     'Global famous content detected — using Wikipedia',
    }
  }

  // Check for local patterns
  const isLocal = LOCAL_PATTERNS.some(p => p.test(text))
  if (isLocal) {
    const category = detectCategory(text)
    const location = extractLocation(text)
    const localQuery = location ? `${category} ${location}` : text
    return {
      mode:       'local_knowledge',
      confidence: 0.85,
      category,
      localQuery,
      wikiQuery:  null,
      reason:     `Local content detected (${category}${location ? ` in ${location}` : ''}) — using Claude internal knowledge`,
    }
  }

  // Check for topic words without explicit local/global scope
  // If there's a city reference, lean local
  const location  = extractLocation(text)
  const category  = detectCategory(text)
  const hasTopic  = category !== 'general'

  if (hasTopic && location) {
    return {
      mode:       'local_knowledge',
      confidence: 0.72,
      category,
      localQuery: `${category} ${location}`,
      wikiQuery:  null,
      reason:     `Topic + city detected (${category} in ${location}) — using Claude internal knowledge`,
    }
  }

  if (hasTopic && !location) {
    // Topic without location — could be either; default to Wikipedia with lower confidence
    return {
      mode:       'wikipedia',
      confidence: 0.60,
      category,
      localQuery: null,
      wikiQuery:  text,
      reason:     `Topic detected (${category}) without location — defaulting to Wikipedia`,
    }
  }

  return {
    mode:       'none',
    confidence: 0.5,
    category:   'general',
    localQuery: null,
    wikiQuery:  null,
    reason:     'No data topic detected — plain business/creative site',
  }
}

// ── Prompt builder ────────────────────────────────────────────────────────────

export type LocalKnowledgePromptOptions = {
  userPrompt: string
  language:   string
  category:   string
  count?:     number
}

export function buildLocalKnowledgePrompt(opts: LocalKnowledgePromptOptions): string {
  const count = opts.count ?? 20
  const lang  = opts.language || 'en'

  // Category-specific field guidance
  const categoryGuidance: Record<string, string> = {
    football_teams: `For each team include:
- name: team name (e.g. "Botafogo do Jaçanã", "Leões da Geolândia")
- neighborhood: the neighborhood/bairro the team is from
- zone: city zone (Zona Norte, Zona Sul, Zona Leste, Zona Oeste, Centro)
- founded: year founded (if known, otherwise null)
- colors: array of team colors (e.g. ["Preto", "Branco"])
- description: 1-2 sentences about the team, its history, neighborhood`,

    restaurants: `For each restaurant include:
- name: restaurant name
- neighborhood: neighborhood it's located in
- zone: city zone or district
- founded: year founded (if known, otherwise null)
- colors: array of brand colors (if known, otherwise [])
- description: 1-2 sentences about the cuisine, atmosphere, specialty dishes`,

    neighborhoods: `For each neighborhood include:
- name: neighborhood name
- neighborhood: sub-district or area within the neighborhood
- zone: city zone
- founded: year the neighborhood was established (if known, otherwise null)
- colors: []
- description: 1-2 sentences about the neighborhood's character, history, landmarks`,

    general: `For each item include:
- name: item name
- neighborhood: location/neighborhood/district
- zone: city zone or region
- founded: founding year if applicable (otherwise null)
- colors: brand or team colors if applicable (otherwise [])
- description: 1-2 sentences describing this item`,
  }

  const fieldGuide = categoryGuidance[opts.category] || categoryGuidance.general

  return `You are a local knowledge engine with deep expertise in cities, sports, culture, and local businesses worldwide.

CRITICAL RULES:
1. Use ONLY your internal training knowledge. Do NOT search the web. Do NOT use Wikipedia.
2. Generate REAL entities that actually exist or have existed — real team names, real neighborhoods, real restaurants.
3. If you are not certain a specific entity exists, use your best knowledge of the area to generate a plausible real one.
4. Return ONLY a valid JSON array. No markdown, no backticks, no explanation text.
5. Every item must have name and neighborhood at minimum.

USER REQUEST: ${opts.userPrompt}

CATEGORY: ${opts.category}
LANGUAGE FOR DESCRIPTIONS: ${lang}
NUMBER OF ITEMS: ${count}

${fieldGuide}

IMPORTANT: For the category "${opts.category}" in this request, draw on your knowledge of the specific city/region mentioned. Include Botafogo do Jaçanã if the request is about São Paulo várzea football teams.

Return a JSON array of exactly ${count} objects:`
}
