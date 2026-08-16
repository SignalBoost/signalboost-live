// Dependency-free policy for deciding when pretrained/local knowledge is not
// sufficient because the answer can change without a code or model update.

const CURRENT_MARKER = /\b(?:current|currently|today|tonight|now|latest|live|breaking|recent|recently|newest|updated|right now|at present|as of today|this morning|this afternoon|this evening|this week|this month)\b/i

const DYNAMIC_ROLE = /\b(?:president|vice president|prime minister|premier|chancellor|governor|mayor|monarch|king|queen|pope|chief executive officer|ceo|chief financial officer|cfo|chief information officer|cio|chief technology officer|cto|chair(?:man|woman)?|secretary of state|attorney general|speaker|minister)\b/i

const VOLATILE_STATE = /\b(?:news|result|results|price|prices|exchange rate|exchange rates|stock price|stock prices|market|markets|weather|forecast|forecasts|score|scores|standings|schedule|schedules|availability|outage|outages|service status|flight status|traffic|alert|alerts|law|laws|regulation|regulations|policy|policies|version|release|election|elections)\b/i

const PRESENT_TENSE_OFFICE_HOLDER = /\bwho\s+is\s+(?:the\s+)?(?:current\s+)?(?:president|vice president|prime minister|premier|chancellor|governor|mayor|monarch|king|queen|pope|chief executive officer|ceo|chief financial officer|cfo|chief information officer|cio|chief technology officer|cto|chair(?:man|woman)?|secretary of state|attorney general|speaker|minister)\b/i

const CURRENT_LEADER = /\bwho\s+(?:currently\s+)?(?:leads|heads|runs)\b/i
const LIVE_NEWS = /\b(?:latest|today(?:'s)?|live|breaking|recent|updated)\s+(?:news|updates?|results?|scores?|standings|alerts?)\b/i

/**
 * Returns true only when the wording itself indicates that the answer depends
 * on live world state. These requests must not be accepted solely from model
 * pretraining, local reasoning, durable memory, or an answer cache, even when
 * a model reports high confidence.
 */
export function requiresFreshExternalEvidence(input: string): boolean {
  const text = String(input || '').replace(/\s+/g, ' ').trim()
  if (!text) return false

  if (PRESENT_TENSE_OFFICE_HOLDER.test(text)) return true
  if (CURRENT_LEADER.test(text)) return true
  if (LIVE_NEWS.test(text)) return true
  if (CURRENT_MARKER.test(text) && (DYNAMIC_ROLE.test(text) || VOLATILE_STATE.test(text))) return true

  return false
}
