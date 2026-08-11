export type DeterministicUtilityName = 'current_time' | 'current_date' | 'current_datetime' | 'current_timezone' | 'current_season' | 'current_datetime_season'

export type DeterministicUtilityResult = {
  handled: true
  reply: string
  source: 'deterministic-current-time' | 'deterministic-current-date' | 'deterministic-current-datetime' | 'deterministic-current-timezone' | 'deterministic-current-season' | 'deterministic-current-datetime-season'
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

function utilityFromQuestion(input: string): DeterministicUtilityName | null {
  const normalized = normalizedPrompt(input)
  const asksTime = /\b(time|what time|current time)\b/.test(normalized)
  const asksDate = /\b(date|today|what day|current date)\b/.test(normalized)
  const asksSeason = /\b(season|season of the year|what season)\b/.test(normalized)
  const asksTimezone = /\b(timezone|time zone)\b/.test(normalized)
  const isCurrent = /\b(current|today|now|is it|is today|the year|my)\b/.test(normalized)

  if (asksSeason && (asksDate || asksTime)) return 'current_datetime_season'
  if (asksSeason && isCurrent) return 'current_season'
  if (asksDate && asksTime) return 'current_datetime'
  if (asksTimezone && isCurrent) return 'current_timezone'

  if (/^(what(?:'s| is) the time|what time is it|what time is is|current time|time now|what(?:'s| is) the current time)$/.test(normalized)) {
    return 'current_time'
  }

  if (/^(what day is (?:it|today)|what(?:'s| is) today(?:'s)? (?:day|date)|what(?:'s| is) the date|what date is it|what date today|today(?:'s)? date|current date|what is today)$/.test(normalized)) {
    return 'current_date'
  }

  if (/^(what(?:'s| is) my timezone|what(?:'s| is) my time zone|what timezone am i in|what time zone am i in|current timezone|current time zone)$/.test(normalized)) {
    return 'current_timezone'
  }

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

function monthInTimeZone(now: Date, timeZone: string): number {
  const month = new Intl.DateTimeFormat('en-US', { timeZone, month: 'numeric' }).format(now)
  return Number(month)
}

function northernSeason(month: number): 'winter' | 'spring' | 'summer' | 'fall' {
  if (month === 12 || month <= 2) return 'winter'
  if (month <= 5) return 'spring'
  if (month <= 8) return 'summer'
  return 'fall'
}

function isLikelySouthernHemisphere(timeZone: string): boolean {
  return /^(Australia\/|Pacific\/(Auckland|Fiji|Noumea|Guadalcanal)|America\/(Argentina\/|Santiago|Sao_Paulo|Montevideo|Asuncion)|Africa\/(Johannesburg|Maseru|Mbabane)|Indian\/(Antananarivo|Mauritius|Reunion))/.test(timeZone)
}

function seasonFor(timeZone: string, now: Date): string {
  const north = northernSeason(monthInTimeZone(now, timeZone))
  if (!isLikelySouthernHemisphere(timeZone)) return north
  return ({ winter: 'summer', spring: 'fall', summer: 'winter', fall: 'spring' } as const)[north]
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
    return { handled: true, reply: `The current time is ${value}.`, source: 'deterministic-current-time', confidence: 1, executionProvenance: provenance(utility, timeZone, input.confidenceThreshold) }
  }

  if (utility === 'current_date') {
    const value = new Intl.DateTimeFormat(locale, { timeZone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(now)
    return { handled: true, reply: `Today is ${value}.`, source: 'deterministic-current-date', confidence: 1, executionProvenance: provenance(utility, timeZone, input.confidenceThreshold) }
  }

  if (utility === 'current_datetime') {
    const value = new Intl.DateTimeFormat(locale, { timeZone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short' }).format(now)
    return { handled: true, reply: `It is ${value}.`, source: 'deterministic-current-datetime', confidence: 1, executionProvenance: provenance(utility, timeZone, input.confidenceThreshold) }
  }

  if (utility === 'current_season') {
    const season = seasonFor(timeZone, now)
    return { handled: true, reply: `The current season is ${season}.`, source: 'deterministic-current-season', confidence: 1, executionProvenance: provenance(utility, timeZone, input.confidenceThreshold) }
  }

  if (utility === 'current_datetime_season') {
    const value = new Intl.DateTimeFormat(locale, { timeZone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short' }).format(now)
    const season = seasonFor(timeZone, now)
    return { handled: true, reply: `It is ${value}. The current season is ${season}.`, source: 'deterministic-current-datetime-season', confidence: 1, executionProvenance: provenance(utility, timeZone, input.confidenceThreshold) }
  }

  return { handled: true, reply: `Your current timezone is ${timeZone}.`, source: 'deterministic-current-timezone', confidence: 1, executionProvenance: provenance(utility, timeZone, input.confidenceThreshold) }
}
