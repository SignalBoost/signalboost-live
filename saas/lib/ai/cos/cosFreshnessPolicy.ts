// Dependency-free policy for deciding when pretrained/local knowledge is not
// sufficient because the answer can change without a code or model update.
//
// This classifier is intentionally about EXTERNAL world state. Internal project,
// campaign, calendar, CRM, inventory, or workflow state belongs to its owning
// connector/system of record rather than being blindly sent to public web search.

const DYNAMIC_ROLE_SOURCE = '(?:president|vice president|prime minister|premier|chancellor|governor|mayor|monarch|king|queen|pope|chief executive officer|ceo|chief financial officer|cfo|chief information officer|cio|chief technology officer|cto|chair(?:man|woman)?|secretary of state|attorney general|speaker|minister)'

const TEMPORAL_LIVE_MARKER = /\b(?:current|currently|today|today's|tonight|now|still|latest|live|breaking|recent|recently|newest|updated|right now|at present|as of today|as of now|this morning|this afternoon|this evening|this week|this month|this year)\b/i
const LOOKUP_INTENT = /^\s*(?:who|what|when|where|which|is|are|has|have|did|does|do|can|could|show|give|check|find|tell\s+me|how\s+much|how\s+many)\b/i
const HISTORICAL_ANCHOR = /\b(?:yesterday|last\s+(?:week|month|year)|historical(?:ly)?|formerly|previously|in\s+(?:19|20)\d{2}|as\s+of\s+(?:19|20)\d{2})\b/i
const CONCEPTUAL_OR_CREATIVE = /^\s*(?:explain|describe|define|teach|write|draft|create|design|build|plan|recommend|suggest|how\s+(?:do|does|did|is|are|can|could|would|should)|why\s+(?:do|does|did|is|are|can|could|would|should))\b/i

const PRESENT_TENSE_OFFICE_HOLDER = new RegExp(`\\bwho\\s+(?:is|['’]s)\\s+(?:(?:the\\s+)?current(?:ly)?\\s+(?:the\\s+)?|(?:the\\s+)?)${DYNAMIC_ROLE_SOURCE}\\b`, 'i')
const TERSE_CURRENT_OFFICE_HOLDER = new RegExp(`^\\s*(?:current|currently)\\s+${DYNAMIC_ROLE_SOURCE}\\b`, 'i')
const CURRENT_LEADER = /\bwho\s+(?:currently\s+)?(?:leads|heads|runs)\b/i
const ROLE_STATUS_CHECK = new RegExp(`^\\s*(?:is|are)\\s+[^?.!]{1,100}\\b(?:still\\s+)?(?:the\\s+)?${DYNAMIC_ROLE_SOURCE}\\b`, 'i')

const NEWS_STATE = /\b(?:news|headlines?|breaking news|news updates?)\b/i
const LIVE_NEWS = /\b(?:latest|today(?:'s)?|live|breaking|recent|updated)\s+(?:news|headlines?|updates?)\b/i

// High-frequency public data that should use a structured real-time provider when available.
const WEATHER_STATE = /\b(?:weather|weather forecast|forecast(?:s)?|temperature|rainfall|snowfall|storm warning|hurricane warning)\b/i
const FINANCIAL_STATE = /\b(?:exchange rate|exchange rates|forex rate|forex rates|stock price|stock prices|share price|share prices|crypto price|crypto prices|cryptocurrency price|cryptocurrency prices|market data|market quote|market quotes|stock market|financial market|index value|index values)\b/i
const TICKER_PRICE = /\b[A-Z]{1,6}(?:['’]s)?\s+(?:stock\s+)?price\b/
const CRYPTO_PRICE = /\b(?:bitcoin|btc|ethereum|eth|solana|sol|cryptocurrency|crypto)\b.{0,35}\b(?:price|quote|rate)\b|\b(?:price|quote|rate)\b.{0,35}\b(?:bitcoin|btc|ethereum|eth|solana|sol|cryptocurrency|crypto)\b/i
const SPORTS_STATE = /\b(?:nba|wnba|nfl|mlb|nhl|epl|premier league|ipl|ncaa|sports?|game|match)\b.{0,45}\b(?:score|scores|standings|schedule)\b|\b(?:score|scores|standings)\b.{0,45}\b(?:nba|wnba|nfl|mlb|nhl|epl|premier league|ipl|ncaa|sports?|game|match)\b/i
const TERSE_SPORTS_STATE = /^\s*(?:nba|wnba|nfl|mlb|nhl|epl|premier league|ipl|ncaa)\b.{0,60}\b(?:score|scores|standings|schedule)\b/i

const OUTAGE_STATE = /\b(?:service|network|internet|cloud|website|site|api|platform)\s+(?:status|outage)|\b(?:outage|outages)\b/i
const TRAVEL_STATE = /\b(?:flight status|departure status|arrival status|live traffic|traffic conditions|road conditions)\b/i
const ELECTION_STATE = /\b(?:election result|election results|election returns|vote count|vote counts|polling results?)\b/i
const PUBLIC_RULE_STATE = /\b(?:law|laws|regulation|regulations|government rule|government rules)\b/i
const SOFTWARE_SECURITY_STATE = /\b(?:security advisory|security advisories|cve|vulnerability|vulnerabilities|software release|package release|library release)\b/i
// A person's life status is a high-impact public fact that can change between model
// updates. People rarely phrase this with an explicit "current" marker (for example,
// "When did George Foreman die?"), so it needs its own live-evidence trigger.
const LIFE_STATUS_STATE = /\b(?:die|died|dead|death|alive|passed away|passed on|deceased)\b/i

function normalizedText(input: string): string {
  return String(input || '').replace(/\s+/g, ' ').trim()
}

function isDirectOrTerseLookup(text: string, state: RegExp): boolean {
  if (!state.test(text)) return false
  if (LOOKUP_INTENT.test(text)) return true
  return !/[.!]\s+\w/.test(text) && text.split(/\s+/).length <= 12
}

export type StructuredLiveDataKind = 'weather' | 'financial' | 'sports'

/**
 * Identifies external high-frequency values for which ordinary web snippets are not an
 * adequate source of truth. Callers should use a structured real-time provider and fail
 * closed if that provider cannot return current data; they must not silently fall back to
 * pretrained/model memory or a stale generic-search snippet.
 */
export function structuredLiveDataKind(input: string): StructuredLiveDataKind | null {
  const text = normalizedText(input)
  if (!text || HISTORICAL_ANCHOR.test(text) || CONCEPTUAL_OR_CREATIVE.test(text)) return null

  if (isDirectOrTerseLookup(text, WEATHER_STATE)) return 'weather'
  if (isDirectOrTerseLookup(text, FINANCIAL_STATE) || TICKER_PRICE.test(text) || isDirectOrTerseLookup(text, CRYPTO_PRICE)) return 'financial'
  if (TERSE_SPORTS_STATE.test(text) || (LOOKUP_INTENT.test(text) && SPORTS_STATE.test(text))) return 'sports'
  return null
}

/**
 * Returns true when the request depends on rapidly changing EXTERNAL world state.
 *
 * Hard rule: a positive result means model pretraining, local reasoning, durable
 * memory, semantic/exact cache, and prior conversation facts are not permitted
 * to establish the answer. COS must retrieve fresh external evidence on this turn.
 */
export function requiresFreshExternalEvidence(input: string): boolean {
  const text = normalizedText(input)
  if (!text) return false

  if (HISTORICAL_ANCHOR.test(text)) return false

  if (PRESENT_TENSE_OFFICE_HOLDER.test(text)) return true
  if (TERSE_CURRENT_OFFICE_HOLDER.test(text)) return true
  if (CURRENT_LEADER.test(text)) return true
  if (ROLE_STATUS_CHECK.test(text)) return true

  if (LIVE_NEWS.test(text)) return true
  if (LOOKUP_INTENT.test(text) && NEWS_STATE.test(text) && TEMPORAL_LIVE_MARKER.test(text)) return true

  if (CONCEPTUAL_OR_CREATIVE.test(text)) return false

  if (structuredLiveDataKind(text)) return true
  if (LOOKUP_INTENT.test(text) && OUTAGE_STATE.test(text)) return true
  if (isDirectOrTerseLookup(text, TRAVEL_STATE)) return true
  if (isDirectOrTerseLookup(text, ELECTION_STATE)) return true

  if (LOOKUP_INTENT.test(text) && PUBLIC_RULE_STATE.test(text)) return true
  if (LOOKUP_INTENT.test(text) && SOFTWARE_SECURITY_STATE.test(text) && TEMPORAL_LIVE_MARKER.test(text)) return true
  if (LOOKUP_INTENT.test(text) && LIFE_STATUS_STATE.test(text)) return true

  return false
}
