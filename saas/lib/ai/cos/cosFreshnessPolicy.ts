// Dependency-free policy for deciding when pretrained/local knowledge is not
// sufficient because the answer can change without a code or model update.

const DYNAMIC_ROLE_SOURCE = '(?:president|vice president|prime minister|premier|chancellor|governor|mayor|monarch|king|queen|pope|chief executive officer|ceo|chief financial officer|cfo|chief information officer|cio|chief technology officer|cto|chair(?:man|woman)?|secretary of state|attorney general|speaker|minister)'

const TEMPORAL_LIVE_MARKER = /\b(?:current|currently|today|today's|tonight|now|still|latest|live|breaking|recent|recently|newest|updated|right now|at present|as of today|as of now|this morning|this afternoon|this evening|this week|this month|this year|tomorrow|upcoming)\b/i

const DYNAMIC_ROLE = new RegExp(`\\b${DYNAMIC_ROLE_SOURCE}\\b`, 'i')

// These facts are inherently operational/volatile when a user asks for their value or status.
// A user should not need to remember to type "current" for COS to understand that a stock price,
// weather report, score, outage, flight status, or breaking-news answer can become stale immediately.
// Avoid generic "market" here because it is also a verb in ordinary marketing requests.
const INHERENTLY_LIVE_STATE = /\b(?:news|updates?|result|results|price|prices|share price|share prices|exchange rate|exchange rates|stock price|stock prices|stock market|financial market|market price|market prices|market data|weather|forecast|forecasts|score|scores|standings|schedule|schedules|availability|inventory|outage|outages|service status|flight status|departure status|arrival status|traffic|delay|delays|wait time|wait times|alert|alerts|poll|polls|election result|election results)\b/i

// These are versioned/current-state domains. They require a live check when the user is asking for
// the operative/current value rather than asking a conceptual or explicitly historical question.
const VERSIONED_STATE = /\b(?:law|laws|regulation|regulations|policy|policies|version|release|security advisory|security advisories|vulnerability|vulnerabilities)\b/i

const PRESENT_TENSE_OFFICE_HOLDER = new RegExp(`\\bwho\\s+(?:is|['’]s)\\s+(?:the\\s+)?(?:current\\s+)?${DYNAMIC_ROLE_SOURCE}\\b`, 'i')
const CURRENT_LEADER = /\bwho\s+(?:currently\s+)?(?:leads|heads|runs)\b/i
const ROLE_STATUS_CHECK = new RegExp(`\\b(?:is|are)\\s+[^?.!]{1,100}\\b(?:still\\s+)?(?:the\\s+)?${DYNAMIC_ROLE_SOURCE}\\b`, 'i')
const LIVE_NEWS = /\b(?:latest|today(?:'s)?|live|breaking|recent|updated)\s+(?:news|updates?|results?|scores?|standings|alerts?)\b/i

const HISTORICAL_ANCHOR = /\b(?:yesterday|last\s+(?:week|month|year)|historical(?:ly)?|formerly|previously|in\s+(?:19|20)\d{2}|as\s+of\s+(?:19|20)\d{2})\b/i
const CONCEPTUAL_EXPLANATION = /^\s*(?:explain|describe|define|teach|how\s+(?:do|does|did|is|are|can|could|would)|why\s+(?:do|does|did|is|are|can|could|would))\b/i
const LOOKUP_INTENT = /^\s*(?:who|what|when|where|which|is|are|has|have|did|does|do|can|could|show|give|check|find|tell\s+me|how\s+much|how\s+many)\b/i

/**
 * Returns true when the request depends on live world state.
 *
 * Hard rule: a positive result means model pretraining, local reasoning, durable
 * memory, semantic/exact cache, and prior conversation facts are not permitted
 * to establish the answer. COS must retrieve live evidence on this turn first.
 */
export function requiresFreshExternalEvidence(input: string): boolean {
  const text = String(input || '').replace(/\s+/g, ' ').trim()
  if (!text) return false

  // Explicit freshness language always wins for dynamic roles and volatile/versioned state.
  if (TEMPORAL_LIVE_MARKER.test(text) && (DYNAMIC_ROLE.test(text) || INHERENTLY_LIVE_STATE.test(text) || VERSIONED_STATE.test(text))) return true
  if (LIVE_NEWS.test(text)) return true

  // An explicit historical anchor is not a current-world lookup. It may still need external
  // research elsewhere, but it must not be mislabeled as a live/current-fact request here.
  if (HISTORICAL_ANCHOR.test(text)) return false

  // Present-tense leadership/office-holder status is inherently current even when the user does
  // not type "current". Examples: "Who is the CEO...?" and "Is X still president...?"
  if (PRESENT_TENSE_OFFICE_HOLDER.test(text)) return true
  if (CURRENT_LEADER.test(text)) return true
  if (ROLE_STATUS_CHECK.test(text)) return true

  // Do not turn conceptual teaching questions into live lookups merely because they mention a
  // volatile noun (for example, "Explain how stock prices work").
  if (CONCEPTUAL_EXPLANATION.test(text)) return false

  // Operational values/statuses are live by nature. "What is TSLA's stock price?" and
  // "Weather in Paramaribo?" must be fresh even without an explicit freshness adjective.
  if (INHERENTLY_LIVE_STATE.test(text)) return true

  // Laws, regulations, policies, software/security versions and releases change over time. Treat
  // direct lookup questions as current-state requests unless they were explicitly historical above.
  if (LOOKUP_INTENT.test(text) && VERSIONED_STATE.test(text)) return true

  return false
}
