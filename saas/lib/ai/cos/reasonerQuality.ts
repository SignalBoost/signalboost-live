import { assessAnswerSpecificity } from '@/lib/ai/cos/answerSpecificity'
import { parseLocalResult } from '@/lib/ai/cos/reasonerOutput'

const DIAGNOSTIC_PROMPT = /\b(?:diagnos\w*|root cause|rank(?:ed|ing)?|most likely|bottleneck|latency|incident|degrad\w*|why .*slow|why .*fail)\b/i

export type ReasonerDraftQuality = {
  parseable: boolean
  diagnostic: boolean
  cap: number
  score: number
  genericBuckets: number
  mechanisms: number
}

export function assessReasonerDraft(prompt: string, raw: string): ReasonerDraftQuality {
  const parsed = parseLocalResult(String(raw ?? ''))
  const diagnostic = DIAGNOSTIC_PROMPT.test(String(prompt ?? ''))
  if (!parsed) {
    return { parseable: false, diagnostic, cap: 0, score: 0, genericBuckets: 0, mechanisms: 0 }
  }
  const specificity = assessAnswerSpecificity(parsed.answer)
  return {
    parseable: true,
    diagnostic,
    cap: specificity.cap,
    score: specificity.score,
    genericBuckets: specificity.signals.genericDiagnosticBuckets.length,
    mechanisms: specificity.signals.diagnosticMechanisms.length,
  }
}

/**
 * One local rewrite is allowed when a diagnostic draft is structurally generic. This is not a
 * second opinion and it does not involve an external provider; it is the same independent COS
 * runtime being told exactly why its first draft failed the deterministic quality gate.
 */
export function reasonerDraftNeedsRepair(prompt: string, raw: string): boolean {
  const quality = assessReasonerDraft(prompt, raw)
  if (!quality.parseable || !quality.diagnostic) return false
  if (quality.cap < 0.72) return true
  return quality.genericBuckets >= 2 && quality.mechanisms < 3
}

export function buildDiagnosticRepairPrompt(originalPrompt: string, _firstRaw: string): string {
  return [
    originalPrompt,
    '',
    'QUALITY REPAIR — solve the incident again from the original facts. Your previous draft was rejected as category-shaped; do not copy it, defend it, or reuse the headings from it.',
    '',
    'Reason from the asymmetries before naming causes:',
    '- If only one tenant class is affected, prefer mechanisms scoped to that class or to resources it uniquely uses. Demote explanations that should affect all tenants equally.',
    '- If overall traffic is unchanged, prefer state-dependent mechanisms such as queue/pool saturation at a tier boundary, working-set/cache threshold crossing, plan/cardinality changes, shard or routing placement, throttling/quota thresholds, or dependency behavior tied to that tenant class over a generic load explanation.',
    '- If there was no deployment, distinguish mechanisms that can change without code: data growth/skew, statistics or plan changes, cache eviction, pool occupancy, noisy-neighbor placement, routing/config drift, certificate/DNS/dependency state, or provider-side throttling.',
    '- Treat normal aggregate CPU and memory as evidence against global compute exhaustion, not as proof that waits, queues, locks, I/O, pools, caches, or downstream dependencies are healthy.',
    '',
    'The rewritten answer MUST:',
    '- rank concrete causal mechanisms, not generic buckets such as "resource contention", "network latency", "configuration differences", or "application bottleneck";',
    '- explicitly say why each mechanism fits the enterprise-only symptom, the no-deployment fact, the unchanged overall traffic, and the normal aggregate database CPU/memory;',
    '- for each ranked cause, name exact read-only observables that distinguish it from the others and a condition that would falsify it;',
    '- use only existing logs, traces, metrics, database/system views, configuration snapshots, query plans already captured by observability, or historical telemetry; do not require a production mutation;',
    '- avoid EXPLAIN ANALYZE on production unless an equivalent plan is already captured, because executing it can add load or side effects;',
    '- keep claims proportional to supplied evidence and lower confidence if the mechanisms remain uncertain.',
    '',
    'Return a fresh answer. Do not mention this repair instruction or the rejected draft.',
  ].join('\n')
}

export function preferRepairedDraft(prompt: string, firstRaw: string, repairedRaw: string): boolean {
  const first = assessReasonerDraft(prompt, firstRaw)
  const repaired = assessReasonerDraft(prompt, repairedRaw)
  if (!repaired.parseable) return false
  if (!first.parseable) return true
  if (repaired.cap !== first.cap) return repaired.cap > first.cap
  if (repaired.mechanisms !== first.mechanisms) return repaired.mechanisms > first.mechanisms
  if (repaired.genericBuckets !== first.genericBuckets) return repaired.genericBuckets < first.genericBuckets
  return repaired.score > first.score
}
