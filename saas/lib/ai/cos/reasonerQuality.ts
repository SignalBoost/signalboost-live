import { assessAnswerSpecificity } from './answerSpecificity.ts'
import { parseLocalResult } from './reasonerOutput.ts'
import { classifyScriptRequest, executiveDecisionDirective, scriptRequestDirective } from './scriptRequestIntent.ts'

const DIAGNOSTIC_PROMPT = /\b(?:diagnos\w*|root cause|rank(?:ed|ing)?|most likely|bottleneck|latency|incident|degrad\w*|why .*slow|why .*fail)\b/i
const CODE_SHAPED_ANSWER = /```\s*(?:python|py|javascript|js|typescript|ts|bash|shell|powershell|ruby|php|java|c\+\+|c#|go|rust)?\b|\b(?:import\s+[A-Za-z_][\w.]*|from\s+[A-Za-z_][\w.]*\s+import\s+|class\s+[A-Za-z_]\w*\s*[:({]|def\s+[A-Za-z_]\w*\s*\(|function\s+[A-Za-z_$]\w*\s*\(|if\s+__name__\s*==|console\.log\s*\(|npm\s+(?:run|install)|#!\/(?:usr\/bin\/env\s+)?(?:bash|sh|python))\b/m
const PROGRAMMING_REDIRECT = /\b(?:programming language|source code|python|javascript|typescript|bash|powershell|choose (?:a |the )?(?:language|runtime)|specify (?:a |the )?(?:language|runtime|format))\b/i
const CONTENT_SCRIPT_REFUSAL = /\b(?:a single script cannot be written|cannot write (?:a |the )?script|can't write (?:a |the )?script|unable to write (?:a |the )?script|need you to specify|need more information before (?:i can |i )?(?:write|produce|draft|create))\b/i

function userQuestionOnly(prompt: string): string {
  const full = String(prompt || '').slice(0, 24_000)
  const marker = 'USER QUESTION:'
  const index = full.lastIndexOf(marker)
  return (index >= 0 ? full.slice(index + marker.length) : full).trim().slice(0, 12_000)
}

function quantitativeDecisionClaims(text: string): string[] {
  const input = String(text || '')
  const claims = [
    ...input.matchAll(/\b\d+(?:\.\d+)?\s*%/g),
    ...input.matchAll(/\bQ[1-4]\b/gi),
    ...input.matchAll(/\b(?:19|20)\d{2}\b/g),
    ...input.matchAll(/\b\d+(?:\.\d+)?\s*(?:hours?|days?|weeks?|months?|years?)\b/gi),
  ].map(match => match[0].toLowerCase().replace(/\s+/g, ' ').trim())
  return [...new Set(claims)]
}

/**
 * Executive decision answers may reuse quantitative facts supplied by the user, but they must not
 * manufacture percentages, schedule periods, quarters, or dates to make a memo appear complete.
 * This is intentionally narrow: ordinary calculations and non-executive answers are untouched.
 */
export function unsupportedExecutiveQuantitativeClaims(prompt: string, raw: string): string[] {
  if (!executiveDecisionDirective(prompt)) return []
  const parsed = parseLocalResult(String(raw ?? ''))
  if (!parsed) return []
  const supplied = new Set(quantitativeDecisionClaims(userQuestionOnly(prompt)))
  return quantitativeDecisionClaims(parsed.answer).filter(claim => !supplied.has(claim))
}

/** Whether a prompt asks for diagnosis/troubleshooting rather than a conceptual explanation. */
export function promptAppearsDiagnostic(prompt: string): boolean {
  return DIAGNOSTIC_PROMPT.test(String(prompt ?? ''))
}

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
  const diagnostic = promptAppearsDiagnostic(prompt)
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
 * A written-script request must not silently drift into executable code merely because the named
 * subject is underspecified. The prompt already tells us which sense of "script" the user asked
 * for; this gate checks whether the draft violated that deterministic interpretation.
 */
export function contentScriptSemanticMismatch(prompt: string, raw: string): boolean {
  if (classifyScriptRequest(prompt) !== 'content') return false
  const parsed = parseLocalResult(String(raw ?? ''))
  if (!parsed) return false
  const answer = parsed.answer
  const opening = answer.slice(0, 1200)
  return CODE_SHAPED_ANSWER.test(answer) || PROGRAMMING_REDIRECT.test(opening) || CONTENT_SCRIPT_REFUSAL.test(opening)
}

/**
 * One local rewrite is allowed when a draft violates a deterministic semantic boundary or when a
 * diagnostic answer is structurally generic. This is not a second opinion and it does not involve
 * an external provider; it is the same independent COS runtime being told exactly why its first
 * draft failed the deterministic quality gate.
 */
export function reasonerDraftNeedsRepair(prompt: string, raw: string): boolean {
  if (contentScriptSemanticMismatch(prompt, raw)) return true
  if (unsupportedExecutiveQuantitativeClaims(prompt, raw).length > 0) return true
  const quality = assessReasonerDraft(prompt, raw)
  if (!quality.parseable || !quality.diagnostic) return false
  if (quality.cap < 0.72) return true
  return quality.genericBuckets >= 2 && quality.mechanisms < 3
}

export function buildDiagnosticRepairPrompt(originalPrompt: string, firstRaw: string): string {
  const executiveDirective = executiveDecisionDirective(originalPrompt)
  const unsupportedExecutiveClaims = unsupportedExecutiveQuantitativeClaims(originalPrompt, firstRaw)
  if (executiveDirective && unsupportedExecutiveClaims.length) {
    return [
      originalPrompt,
      '',
      'EXECUTIVE QUALITY REPAIR — the previous draft added quantitative or contractual certainty that was not present in the original facts.',
      executiveDirective,
      '',
      `Unsupported quantitative claims detected by the server gate: ${unsupportedExecutiveClaims.join(', ')}.`,
      'Rewrite the executive memo from the original user facts only.',
      '- Preserve exactly the supplied figures and timelines; do not add a current date, new quarter, new utilization percentage, new budget percentage, new duration, probability, outage cost, or staffing estimate.',
      '- Do not claim that a Minimum Viable Tenant, phased rollout, waiver, or other workaround satisfies the contract unless the original facts establish that condition.',
      '- Treat customer acceptance, contract flexibility, security readiness, additional staffing, outsourcing, budget contingency, and compliance status as UNKNOWN unless supplied.',
      '- Separate KNOWN FACTS from UNKNOWNS/VALIDATION NEEDED before presenting options.',
      '- For each option, show only consequences supported by the prompt. Use placeholders such as [Finance estimate required] rather than fabricated values.',
      '- If recommending a path, make it conditional on the unresolved facts that must be verified. Do not label an option low-risk without evidence.',
      '- The CEO wanting both outcomes is a goal; state what additional resource, scope change, schedule change, or explicit risk acceptance would be required to make both feasible.',
      '',
      'Return a fresh answer. Do not mention this repair instruction or the rejected draft.',
    ].join('\n')
  }

  const scriptDirective = scriptRequestDirective(originalPrompt)
  if (scriptDirective && classifyScriptRequest(originalPrompt) === 'content') {
    return [
      originalPrompt,
      '',
      'QUALITY REPAIR — your previous draft violated the requested meaning of "script".',
      scriptDirective,
      '',
      'Produce the requested written script now.',
      '- Keep every unknown attribute unknown; use wording that remains valid whether the named subject is a person, product, company, service, project, or something else.',
      '- Do not explain that the ambiguity prevents writing. The ambiguity is a constraint on wording, not a reason to refuse.',
      '- Do not provide a programming template, source code, classes, functions, APIs, or a choice of programming language.',
      '- Do not invent factual attributes, features, roles, capabilities, dates, or identity details that the user did not supply.',
      '- Return the actual script first. A short note about what was intentionally left unspecified is allowed only after the script.',
      '',
      'Return a fresh answer. Do not mention this repair instruction or the rejected draft.',
    ].join('\n')
  }

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
  const firstScriptMismatch = contentScriptSemanticMismatch(prompt, firstRaw)
  const repairedScriptMismatch = contentScriptSemanticMismatch(prompt, repairedRaw)
  if (firstScriptMismatch !== repairedScriptMismatch) return !repairedScriptMismatch
  if (firstScriptMismatch && repairedScriptMismatch) return false

  const firstExecutiveClaims = unsupportedExecutiveQuantitativeClaims(prompt, firstRaw)
  const repairedExecutiveClaims = unsupportedExecutiveQuantitativeClaims(prompt, repairedRaw)
  if (firstExecutiveClaims.length || repairedExecutiveClaims.length) {
    if (repairedExecutiveClaims.length === 0 && firstExecutiveClaims.length > 0) return true
    if (repairedExecutiveClaims.length !== firstExecutiveClaims.length) return repairedExecutiveClaims.length < firstExecutiveClaims.length
    return false
  }

  const first = assessReasonerDraft(prompt, firstRaw)
  const repaired = assessReasonerDraft(prompt, repairedRaw)
  if (!repaired.parseable) return false
  if (!first.parseable) return true
  if (repaired.cap !== first.cap) return repaired.cap > first.cap
  if (repaired.mechanisms !== first.mechanisms) return repaired.mechanisms > first.mechanisms
  if (repaired.genericBuckets !== first.genericBuckets) return repaired.genericBuckets < first.genericBuckets
  return repaired.score > first.score
}

export type QualityRepairDecisionInput = { repairKind:'quality_repair'|'skill_citation_repair'; reasonerLabel:string; accepted:boolean; details:Record<string,unknown> }

function qualityRepairPersistenceError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>
    const fields = [value.code, value.message, value.details, value.hint]
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    if (fields.length) return fields.join(' | ')
    try { return JSON.stringify(error) } catch { /* fall through */ }
  }
  return String(error)
}

/** Best-effort audit persistence; never blocks COS reasoning. */
export async function recordQualityRepairDecision(input:QualityRepairDecisionInput):Promise<void>{
  try{
    const { cosServiceDb }=await import('@/lib/cos-core/storage/supabase')
    const db=cosServiceDb()
    if(!db)return
    const result=await db.from('cos_quality_repair_decisions').insert({repair_kind:input.repairKind,reasoner_label:input.reasonerLabel,accepted:input.accepted,details:input.details})
    if(result.error)throw result.error
  }catch(error){console.warn('cosReasonerQuality: failed to persist quality-repair decision',qualityRepairPersistenceError(error))}
}
