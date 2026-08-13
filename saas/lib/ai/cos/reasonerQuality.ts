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

export function buildDiagnosticRepairPrompt(originalPrompt: string, firstRaw: string): string {
  const parsed = parseLocalResult(firstRaw)
  const draft = parsed?.answer ?? firstRaw
  return [
    originalPrompt,
    '',
    'QUALITY REPAIR — your first draft was too category-shaped to be served as a senior diagnostic answer.',
    'Rewrite it once. Do not defend or explain the first draft.',
    '',
    'The rewritten answer MUST:',
    '- rank concrete causal mechanisms that explain ALL asymmetries stated in the question, not generic buckets such as "resource contention", "network latency", or "application bottleneck";',
    '- explain how each mechanism could change with no deployment and unchanged overall traffic;',
    '- for each ranked cause, name the exact read-only observable(s) that distinguish it from the others and the condition that would falsify it;',
    '- use existing logs, traces, metrics, database/system views, configuration snapshots, or historical telemetry only; do not propose a production mutation;',
    '- prefer mechanisms whose scope matches the affected tenant class over explanations that should affect every tenant equally;',
    '- keep claims proportional to the supplied evidence and lower confidence if you still cannot make the diagnosis concrete.',
    '',
    'FIRST DRAFT TO REPLACE:',
    draft,
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
