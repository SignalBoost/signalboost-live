export type DeterministicUtilityResult = {
  handled: true
  reply: string
  source: 'deterministic-current-time'
  confidence: 1
  executionProvenance: {
    schema_version: 1
    authority: 'server_execution_telemetry'
    model_generated: false
    deterministic_utility: { used: true; utility: 'current_time'; timezone: string }
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

function isCurrentTimeQuestion(input: string): boolean {
  const normalized = input.toLowerCase().replace(/[?.!,]+/g, ' ').replace(/\s+/g, ' ').trim()
  return /^(what(?:'s| is) the time|what time is it|current time|time now|what(?:'s| is) the current time)$/.test(normalized)
}

export function tryDeterministicUtility(input: {
  prompt: string
  timezone?: unknown
  locale?: string
  confidenceThreshold: number
}): DeterministicUtilityResult | null {
  if (!isCurrentTimeQuestion(input.prompt)) return null

  const timeZone = validTimeZone(input.timezone) || 'UTC'
  const locale = input.locale || 'en-US'
  const time = new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  }).format(new Date())

  return {
    handled: true,
    reply: `The current time is ${time}.`,
    source: 'deterministic-current-time',
    confidence: 1,
    executionProvenance: {
      schema_version: 1,
      authority: 'server_execution_telemetry',
      model_generated: false,
      deterministic_utility: { used: true, utility: 'current_time', timezone: timeZone },
      semantic_cache: { used: false, evidence_count: 0 },
      enterprise_memory: { used: false, evidence_count: 0 },
      knowledge_graph: { used: false, evidence_count: 0 },
      learned_corpus: { used: false, evidence_count: 0 },
      user_memory: { used: false, evidence_count: 0 },
      autonomous_research: { used: false, documents_acquired: 0, new_knowledge_retained: 0 },
      local_reasoning: { invoked: false, model: null, confidence: 1, threshold: input.confidenceThreshold },
      external_ai: { invoked: false, provider: null, model: null },
    },
  }
}
