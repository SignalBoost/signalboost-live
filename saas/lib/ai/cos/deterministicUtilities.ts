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

function utilityFromQuestion(input: string): DeterministicUtilityName | null {
  const normalized = normalizedPrompt(input)

  if (/^(what(?:'s| is) the time|what time is it|current time|time now|what(?:'s| is) the current time)$/.test(normalized)) {
    return 'current_time'
  }

  if (/^(what day is (?:it|today)|what(?:'s| is) today(?:'s)? (?:day|date)|what(?:'s| is) the date|what date is it|today(?:'s)? date|current date|what is today)$/.test(normalized)) {
    return 'current_date'
  }

  if (/^(what(?:'s| is) the date and time|what(?:'s| is) the time and date|current date and time|current time and date|what day and time is it)$/.test(normalized)) {
    return 'current_datetime'
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
