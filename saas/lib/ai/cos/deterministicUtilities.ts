export type DeterministicUtilityName = 'current_time' | 'current_date' | 'current_datetime' | 'current_timezone'

export type DeterministicUtilityResult = {
  handled: true
  reply: string
  source: 'deterministic-current-time' | 'deterministic-current-date' | 'deterministic-current-datetime' | 'deterministic-current-timezone'
  confidence: 1
  executionProvenance: {
    schema_version: 1
    authority: 'server_execution_telemetry'
    model_generated: false
    deterministic_utility: { used: true; utility: DeterministicUtilityName; timezone: string }
    semantic_cache: { used: false; evidence_count: 0 }
    enterprise_memory: { used: false; evidence_count: 0 }
    knowledge_graph: { used: false; evidence_count: 0 }
    learned_corpus: { used: false; evidence_count: 0 }
    user_memory: { used: false; evidence_count: 0 }
    autonomous_research: { used: false; documents_acquired: 0; new_knowledge_retained: 0 }
    local_reasoning: { invoked: false; model: null; confidence: 1; threshold: number }
    external_ai: { invoked: false; provider: null; model: null }
  }
}

function validTimeZone(value: unknown): string | null {
  const timeZone = String(value || '').trim()
  if (!timeZone) return null
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date())
    return timeZone
  } catch {
    return null
  }
}

function normalizedPrompt(input: string): string {
  return input.toLowerCase().replace(/[?.!,]+/g, ' ').replace(/\s+/g, ' ').trim()
}

// SHAPE-BASED DETECTION, NOT AN EXACT-PHRASE LIST.
//
// "what date is today" fell through to full COS reasoning — which then rummaged
// the learning corpus for an unrelated document and cited its date — because the
// old matcher was a closed list of exact strings and that phrasing was not on it.
// The question was not ambiguous or oddly worded; the list was just too narrow.
// Widening it one phrase at a time repeats the same failure for the next paraphrase.
//
// The fix is to recognise the SHAPE of the question instead: a short sentence built
// from a temporal noun (date/day/time/timezone) plus a present-tense anchor
// (today/now/current/currently), with nothing else that would make it about a
// DIFFERENT date — a meeting, a deadline, an event, a historical incident. This is
// still zero-comprehension pattern matching by design (model_generated stays
// false) — it is a wider, more honest pattern, not a step toward understanding.
// A genuinely ambiguous or unusual phrasing still correctly falls through to the
// reasoner, which is where real interpretation belongs.
const TEMPORAL_ANCHOR = /\b(today|now|current(?:ly)?|right now|at the moment)\b/
const OTHER_SUBJECT = /\b(meeting|deadline|event|incident|appointment|due|schedule[d]?|release|deploy(?:ment)?|call|game|match|flight|birthday|anniversary|holiday|expir|renew|invoice|payment|report|open|close|start|begin|end|leave|arrive|depart)\b/

function utilityFromQuestion(input: string): DeterministicUtilityName | null {
  const normalized = normalizedPrompt(input)

  // Reject early: a question naming a DIFFERENT thing that has its own date/time
  // ("what date is the deadline", "what time is the meeting today") is never a
  // request for the current date/time, however close the wording looks.
  if (OTHER_SUBJECT.test(normalized)) return null

  const asksDateAndTime = /\b(date and time|time and date|day and time)\b/.test(normalized)
  const asksTimezone = /\b(time ?zone)\b/.test(normalized)
  const asksTime = /\btime\b/.test(normalized)
  const asksDate = /\b(date|day)\b/.test(normalized)

  const hasAnchor = TEMPORAL_ANCHOR.test(normalized)
  // "what day is it" / "what time is it" — "it" stands in for the anchor. "what
  // timezone am i in" carries the same self-referential anchor as "am i" rather
  // than "is it". Both are named explicitly rather than requiring literal
  // "today"/"now"/"current" every time.
  const hasItAnchor = /\b(is it|it is|am i)\b/.test(normalized)
  const anchored = hasAnchor || hasItAnchor

  // Every accepted shape is a QUESTION about a temporal noun, phrased as one of:
  // "what/what's <noun> <anchor>", "<noun> <anchor>", or the bare "<noun> is it"
  // pattern already covered by hasItAnchor above. This still excludes declarative
  // sentences and anything with an object/subject beyond the temporal noun itself.
  const looksLikeQuestion =
    /^(what|when)\b/.test(normalized) || /\b(is it|are we)\b/.test(normalized) || normalized.split(' ').length <= 5

  if (!anchored || !looksLikeQuestion) return null

  if (asksTimezone) return 'current_timezone'
  if (asksDateAndTime) return 'current_datetime'
  if (asksDate && asksTime) return 'current_datetime'
  if (asksDate) return 'current_date'
  if (asksTime) return 'current_time'

  // "what is today" carries no explicit date/day/time noun — "today" itself IS the
  // noun being asked about. Only accepted as this exact minimal shape, so it never
  // swallows a longer sentence that merely happens to contain the word "today".
  if (/^what is today\??$/.test(normalized)) return 'current_date'

  return null
}

function provenance(utility: DeterministicUtilityName, timeZone: string, threshold: number): DeterministicUtilityResult['executionProvenance'] {
  return {
    schema_version: 1,
    authority: 'server_execution_telemetry',
    model_generated: false,
    deterministic_utility: { used: true, utility, timezone: timeZone },
    semantic_cache: { used: false, evidence_count: 0 },
    enterprise_memory: { used: false, evidence_count: 0 },
    knowledge_graph: { used: false, evidence_count: 0 },
    learned_corpus: { used: false, evidence_count: 0 },
    user_memory: { used: false, evidence_count: 0 },
    autonomous_research: { used: false, documents_acquired: 0, new_knowledge_retained: 0 },
    local_reasoning: { invoked: false, model: null, confidence: 1, threshold },
    external_ai: { invoked: false, provider: null, model: null },
  }
}

export function tryDeterministicUtility(input: {
  prompt: string
  timezone?: unknown
  locale?: string
  confidenceThreshold: number
}): DeterministicUtilityResult | null {
  const utility = utilityFromQuestion(input.prompt)
  if (!utility) return null

  const timeZone = validTimeZone(input.timezone) || 'UTC'
  const locale = input.locale || 'en-US'
  const now = new Date()

  if (utility === 'current_time') {
    const value = new Intl.DateTimeFormat(locale, {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    }).format(now)
    return {
      handled: true,
      reply: `The current time is ${value}.`,
      source: 'deterministic-current-time',
      confidence: 1,
      executionProvenance: provenance(utility, timeZone, input.confidenceThreshold),
    }
  }

  if (utility === 'current_date') {
    const value = new Intl.DateTimeFormat(locale, {
      timeZone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(now)
    return {
      handled: true,
      reply: `Today is ${value}.`,
      source: 'deterministic-current-date',
      confidence: 1,
      executionProvenance: provenance(utility, timeZone, input.confidenceThreshold),
    }
  }

  if (utility === 'current_datetime') {
    const value = new Intl.DateTimeFormat(locale, {
      timeZone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    }).format(now)
    return {
      handled: true,
      reply: `It is ${value}.`,
      source: 'deterministic-current-datetime',
      confidence: 1,
      executionProvenance: provenance(utility, timeZone, input.confidenceThreshold),
    }
  }

  return {
    handled: true,
    reply: `Your current timezone is ${timeZone}.`,
    source: 'deterministic-current-timezone',
    confidence: 1,
    executionProvenance: provenance(utility, timeZone, input.confidenceThreshold),
  }
}
