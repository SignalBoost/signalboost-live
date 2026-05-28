export type PromptIntent =
  | 'data_fetching'
  | 'wikipedia_query'
  | 'csv_import'
  | 'scraper_import'
  | 'database_seeding'
  | 'site_generation'
  | 'content_creation'
  | 'mixed_instructions'

export type ConfidenceLabel = 'low' | 'medium' | 'high'

export type QueryExtraction = {
  query: string | null
  confidence: number
  confidenceLabel: ConfidenceLabel
  keywords: string[]
  nouns: string[]
  normalizedText: string
}

export type ValidatedItem = {
  name: string
  description: string
  image_url: string | null
  source_url: string
  metadata: Record<string, unknown>
}

export type PromptPreprocessorResult = {
  rawInput: string
  normalizedText: string
  cleanedPrompt: string
  optimizedPrompt: string
  transparencyMessage: string
  intent: PromptIntent
  intentScores: Record<PromptIntent, number>
  keywords: string[]
  query: string | null
  confidence: number
  confidenceLabel: ConfidenceLabel
  shouldUseFallback: boolean
  validation: {
    requiredFields: string[]
    filledFields: string[]
    skippedRows: Array<{ row: number; reason: string }>
  }
}

const CONFIDENCE_THRESHOLD = 0.6

const TYPO_MAP: Record<string, string> = {
  restuarants: 'restaurants',
  restaraunts: 'restaurants',
  restrants: 'restaurants',
  musuem: 'museum',
  musem: 'museum',
  musuems: 'museums',
  univeristy: 'university',
  universitty: 'university',
  footbal: 'football',
  futebool: 'futebol',
  futebol: 'football',
  futball: 'football',
  eqipes: 'teams',
  equipes: 'teams',
  varzea: 'varzea',
  wikipidia: 'wikipedia',
  wikpedia: 'wikipedia',
  scrapper: 'scraper',
  scrap: 'scrape',
  csvs: 'csv',
  seeddb: 'seed',
  db: 'database',
  sp: 'sao paulo',
  sampa: 'sao paulo',
  nyc: 'new york city',
}

const STOP_WORDS = new Set([
  'a','an','the','and','or','but','for','to','of','in','on','at','with','from','by','as','is','are','be','been','being',
  'me','my','mine','i','we','us','our','you','your','please','pls','plz','make','create','build','generate','want','need',
  'site','website','page','app','thing','stuff','nice','cool','good','bad','some','about','into','using','use','show','get',
])

const CANONICAL_TERMS = [
  'wikipedia','csv','scraper','scrape','database','seed','demo','data','fetch','import','generate','site','website','content',
  'team','teams','football','soccer','amateur','varzea','museum','museums','restaurant','restaurants','university','universities',
  'church','churches','beach','beaches','gallery','blog','article','sao','paulo','brazil','world','list','best','top','famous',
]

const INTENT_PROTOTYPES: Record<PromptIntent, string[]> = {
  data_fetching: ['fetch','get','api','data','list','top','best','famous','show','records','items'],
  wikipedia_query: ['wikipedia','wiki','encyclopedia','famous','list','museums','teams','universities','churches'],
  csv_import: ['csv','spreadsheet','upload','import','columns','rows','file'],
  scraper_import: ['scraper','scrape','crawl','website','extract','html','url'],
  database_seeding: ['seed','database','demo','fake','fallback','populate','sample'],
  site_generation: ['generate','build','site','website','landing','page','design','render'],
  content_creation: ['write','copy','content','blog','article','caption','headline','marketing'],
  mixed_instructions: ['and','then','also','plus','with','after','multiple'],
}

const NOUN_PATTERNS = [
  { terms: ['museum', 'museums'], singular: 'museum', plural: 'museums' },
  { terms: ['restaurant', 'restaurants'], singular: 'restaurant', plural: 'restaurants' },
  { terms: ['university', 'universities'], singular: 'university', plural: 'universities' },
  { terms: ['team', 'teams', 'club', 'clubs'], singular: 'team', plural: 'teams' },
  { terms: ['church', 'churches'], singular: 'church', plural: 'churches' },
  { terms: ['beach', 'beaches'], singular: 'beach', plural: 'beaches' },
]

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number(value.toFixed(2))))
}

function confidenceLabel(confidence: number): ConfidenceLabel {
  if (confidence >= 0.75) return 'high'
  if (confidence >= CONFIDENCE_THRESHOLD) return 'medium'
  return 'low'
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j += 1) dp[0][j] = j
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
  }
  return dp[a.length][b.length]
}

function fuzzyToken(token: string): string {
  if (TYPO_MAP[token]) return TYPO_MAP[token]
  if (token.length < 5) return token
  let best = token
  let bestScore = 0
  for (const candidate of CANONICAL_TERMS) {
    const maxLen = Math.max(token.length, candidate.length)
    const similarity = 1 - levenshtein(token, candidate) / maxLen
    if (similarity > bestScore) {
      bestScore = similarity
      best = candidate
    }
  }
  return bestScore >= 0.78 ? best : token
}

export function normalizeInput(text: string): string {
  const expanded = text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

  return expanded
    .split(' ')
    .flatMap((token) => fuzzyToken(token).split(' '))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractKeywords(text: string): string[] {
  const normalizedText = normalizeInput(text)
  const tokens = normalizedText.split(' ').filter(Boolean)
  const phrases = ['sao paulo', 'rio de janeiro', 'new york city', 'data fetch', 'database seed']
  const phraseHits = phrases.filter((phrase) => normalizedText.includes(phrase))
  const tokenHits = tokens.filter((token) => !STOP_WORDS.has(token) && (CANONICAL_TERMS.includes(token) || token.length > 3))
  return unique([...phraseHits, ...tokenHits]).slice(0, 16)
}

function cosineSimilarity(a: string[], b: string[]): number {
  const vocab = unique([...a, ...b])
  if (vocab.length === 0) return 0
  const dot = vocab.reduce((sum, term) => sum + (a.includes(term) && b.includes(term) ? 1 : 0), 0)
  return dot / Math.sqrt(Math.max(1, a.length) * Math.max(1, b.length))
}

export function classifyIntent(text: string): { intent: PromptIntent; scores: Record<PromptIntent, number> } {
  const normalizedText = normalizeInput(text)
  const tokens = normalizedText.split(' ').filter(Boolean)
  const scores = Object.fromEntries(
    Object.entries(INTENT_PROTOTYPES).map(([intent, prototype]) => {
      const keywordHits = prototype.filter((term) => normalizedText.includes(term)).length
      const similarity = cosineSimilarity(tokens, prototype)
      return [intent, clamp01(similarity * 0.7 + Math.min(keywordHits / 5, 1) * 0.3)]
    }),
  ) as Record<PromptIntent, number>

  const strongIntents = Object.entries(scores).filter(([intent, score]) => intent !== 'mixed_instructions' && score >= 0.38)
  const hasConnectors = /\b(and then|also|plus|after that|with csv|and scrape|and seed)\b/.test(normalizedText)
  if (strongIntents.length > 1 || hasConnectors) scores.mixed_instructions = Math.max(scores.mixed_instructions, 0.72)

  const intent = (Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'site_generation') as PromptIntent
  return { intent, scores }
}

function extractNouns(normalizedText: string, keywords: string[]): string[] {
  const nouns = NOUN_PATTERNS
    .filter((pattern) => pattern.terms.some((term) => normalizedText.includes(term)))
    .map((pattern) => normalizedText.includes(pattern.plural) ? pattern.plural : pattern.singular)
  const extraNouns = keywords.filter((keyword) => !INTENT_PROTOTYPES.mixed_instructions.includes(keyword) && !STOP_WORDS.has(keyword))
  return unique([...nouns, ...extraNouns]).slice(0, 8)
}

export function extractQuery(text: string): QueryExtraction {
  const normalizedText = normalizeInput(text)
  const keywords = extractKeywords(normalizedText)
  const nouns = extractNouns(normalizedText, keywords)
  const has = (value: string) => normalizedText.includes(value)
  const hasAny = (values: string[]) => values.some(has)
  let query: string | null = null
  let confidence = 0.3

  if (hasAny(['varzea', 'amateur']) && hasAny(['team', 'teams', 'football', 'soccer']) && has('sao paulo')) {
    query = 'São Paulo amateur football teams Wikipedia'
    confidence = 0.9
  } else if (hasAny(['museum', 'museums']) && hasAny(['world', 'global', 'best', 'top', 'famous', 'list'])) {
    query = 'List of museums in the world Wikipedia'
    confidence = 0.88
  } else if (hasAny(['university', 'universities']) && hasAny(['world', 'best', 'top', 'famous', 'list'])) {
    query = 'List of universities Wikipedia'
    confidence = 0.84
  } else if (hasAny(['restaurant', 'restaurants'])) {
    query = has('sao paulo') ? 'Restaurants in São Paulo Wikipedia' : 'List of restaurants Wikipedia'
    confidence = has('sao paulo') ? 0.78 : 0.7
  } else if (hasAny(['church', 'churches'])) {
    query = has('world') ? 'List of largest church buildings Wikipedia' : 'Famous churches Wikipedia'
    confidence = 0.76
  } else if (hasAny(['beach', 'beaches'])) {
    query = has('sao paulo') ? 'Beaches of São Paulo Wikipedia' : 'List of beaches Wikipedia'
    confidence = 0.76
  } else if (has('wikipedia') && nouns.length > 0) {
    query = `${nouns.slice(0, 4).join(' ')} Wikipedia`
    confidence = 0.65
  } else if (nouns.length >= 2 && hasAny(['list', 'fetch', 'data', 'best', 'top', 'famous'])) {
    query = `${nouns.slice(0, 4).join(' ')} Wikipedia`
    confidence = 0.62
  }

  return { query, confidence: clamp01(confidence), confidenceLabel: confidenceLabel(confidence), keywords, nouns, normalizedText }
}

export function validateItems(items: Array<Partial<ValidatedItem>>, query: string | null): { items: ValidatedItem[]; filledFields: string[]; skippedRows: Array<{ row: number; reason: string }> } {
  const filledFields: string[] = []
  const skippedRows: Array<{ row: number; reason: string }> = []
  const validated = items.map((item, index): ValidatedItem | null => {
    const row = index + 1
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : `Fallback Item ${row}`
    const description = typeof item.description === 'string' && item.description.trim() ? item.description.trim() : `Demo item generated for ${query ?? 'your request'}.`
    const source_url = typeof item.source_url === 'string' && item.source_url.trim() ? item.source_url.trim() : `https://example.com/fallback/${encodeURIComponent(query ?? 'demo')}/${row}`
    if (!item.name) filledFields.push(`items[${index}].name`)
    if (!item.description) filledFields.push(`items[${index}].description`)
    if (!item.source_url) filledFields.push(`items[${index}].source_url`)
    if (!source_url.startsWith('http')) {
      skippedRows.push({ row, reason: 'source_url must be absolute HTTP(S) URL' })
      return null
    }
    return {
      name,
      description,
      image_url: item.image_url ?? null,
      source_url,
      metadata: { ...(item.metadata ?? {}), query: query ?? 'fallback-demo' },
    }
  }).filter((item): item is ValidatedItem => item !== null)
  return { items: validated, filledFields: unique(filledFields), skippedRows }
}

export function buildFallbackItems(query: string | null, count = 12): ValidatedItem[] {
  const topic = query?.replace(/\s+wikipedia$/i, '') || 'SignalBoost demo data'
  return Array.from({ length: count }, (_, index) => ({
    name: `${topic} demo item ${index + 1}`,
    description: `Reliable fallback record ${index + 1} for ${topic}, shown so generated pages never render empty lists.`,
    image_url: null,
    source_url: `https://example.com/signalboost-demo/${encodeURIComponent(topic.toLowerCase().replace(/\s+/g, '-'))}/${index + 1}`,
    metadata: { seeded: true, source: 'fallback-demo', query: query ?? 'fallback-demo' },
  }))
}

export function optimizePrompt(params: {
  rawInput: string
  normalizedText: string
  intent: PromptIntent
  query: string | null
  keywords: string[]
  confidence: number
  useFallback: boolean
}): string {
  const cleanQuery = params.query ?? 'fallback demo data'
  return [
    `Task summary: Generate a complete one-page website from the user's request after NLP cleanup.`,
    `Interpreted intent: ${params.intent}.`,
    `Cleaned user request: ${params.normalizedText}.`,
    `Clean query: ${cleanQuery}.`,
    `Step-by-step instructions: 1) design the page, 2) use real fetched data when provided, 3) otherwise use fallback demo data, 4) render non-empty gallery or feature-grid items.`,
    `Data mapping rules: map item.name/title to card title, item.description to card body, item.image_url to optional image, and item.source_url/wiki_url to attribution URL.`,
    `Validation rules: title/name, query, and source_url are required; fill missing fields with deterministic fallback values; reject invalid source URLs; never emit null values for required schema fields.`,
    `Database schema alignment: Items table columns are name, description, image_url, source_url, metadata, created_at; use source_url for conflict handling.`,
    `UI rendering instructions: always include 5-8 sections, start with hero, include data cards when available, and end with contact.`,
    `Confidence: ${params.confidence.toFixed(2)}. Fallback demo data required: ${params.useFallback ? 'yes' : 'no'}.`,
    `Keywords: ${params.keywords.join(', ') || 'none'}.`,
  ].join('\n')
}

export function promptPreprocessor(rawInput: string, threshold = CONFIDENCE_THRESHOLD): PromptPreprocessorResult {
  const normalizedText = normalizeInput(rawInput)
  const { intent, scores } = classifyIntent(normalizedText)
  const extraction = extractQuery(normalizedText)
  const shouldUseFallback = extraction.confidence < threshold || !extraction.query
  const cleanedPrompt = extraction.query
    ? `Create a ${intent.replace(/_/g, ' ')} experience for: ${extraction.query}.`
    : `Create a ${intent.replace(/_/g, ' ')} experience using safe demo data for: ${normalizedText}.`
  const validatedFallback = validateItems(buildFallbackItems(extraction.query, 3), extraction.query)
  const optimizedPrompt = optimizePrompt({
    rawInput,
    normalizedText,
    intent,
    query: extraction.query,
    keywords: extraction.keywords,
    confidence: extraction.confidence,
    useFallback: shouldUseFallback,
  })

  return {
    rawInput,
    normalizedText,
    cleanedPrompt,
    optimizedPrompt,
    transparencyMessage: `I interpreted your request as: ${cleanedPrompt}`,
    intent,
    intentScores: scores,
    keywords: extraction.keywords,
    query: extraction.query,
    confidence: extraction.confidence,
    confidenceLabel: extraction.confidenceLabel,
    shouldUseFallback,
    validation: {
      requiredFields: ['name', 'query', 'source_url'],
      filledFields: validatedFallback.filledFields,
      skippedRows: validatedFallback.skippedRows,
    },
  }
}

export const PROMPT_PREPROCESSOR_CONFIDENCE_THRESHOLD = CONFIDENCE_THRESHOLD
