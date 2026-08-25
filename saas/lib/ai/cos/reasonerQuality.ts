import { assessAnswerSpecificity } from './answerSpecificity.ts'
import { parseLocalResult } from './reasonerOutput.ts'
import { classifyScriptRequest, executiveDecisionDirective, scriptRequestDirective } from './scriptRequestIntent.ts'

const DIAGNOSTIC_PROMPT = /\b(?:diagnos\w*|root cause|rank(?:ed|ing)?|most likely|bottleneck|latency|incident|degrad\w*|why .*slow|why .*fail)\b/i
const CODE_SHAPED_ANSWER = /```\s*(?:python|py|javascript|js|typescript|ts|bash|shell|powershell|ruby|php|java|c\+\+|c#|go|rust)?\b|\b(?:import\s+[A-Za-z_][\w.]*|from\s+[A-Za-z_][\w.]*\s+import\s+|class\s+[A-Za-z_]\w*\s*[:({]|def\s+[A-Za-z_]\w*\s*\(|function\s+[A-Za-z_$]\w*\s*\(|if\s+__name__\s*==|console\.log\s*\(|npm\s+(?:run|install)|#!\/(?:usr\/bin\/env\s+)?(?:bash|sh|python))\b/m
const PROGRAMMING_REDIRECT = /\b(?:programming language|source code|python|javascript|typescript|bash|powershell|choose (?:a |the )?(?:language|runtime)|specify (?:a |the )?(?:language|runtime|format))\b/i
const CONTENT_SCRIPT_REFUSAL = /\b(?:a single script cannot be written|cannot write (?:a |the )?script|can't write (?:a |the )?script|unable to write (?:a |the )?script|need you to specify|need more information before (?:i can |i )?(?:write|produce|draft|create))\b/i
const EXECUTIVE_UNSUPPORTED_CERTAINTY = /\b(?:risk of (?:cannibali[sz]ation|downgrad(?:e|ing)) is low|(?:renewals?|contracts?) (?:are|is) safe|(?:clients?|customers?) will not (?:downgrade|leave)|must (?:stay|remain) on (?:enterprise|the enterprise tier)|cannot (?:practically )?(?:move|downgrade)|is (?:safe|manageable) because)\b/i
const SECURITY_SCENARIO = /\b(?:zero[- ]day|vulnerabilit|tenant\s+metadata|infosec|security\s+lead)\b/i
const UNSUPPORTED_SECURITY_FRAMEWORK = /\b(?:IL[2456]|impact\s+level\s*[2456]|authorizing\s+official|system\s+security\s+plan|\bSSP\b|fedramp|rmf|nist\s*800[- ]53)\b/i

/**
 * Executive recommendations may state user-supplied facts, but must not turn uncertain outcomes
 * into facts or introduce numeric targets that the scenario never supplied.
 */
export function executiveDecisionUnsupportedClaims(prompt: string, raw: string): string[] {
  const securityScenario = SECURITY_SCENARIO.test(prompt)
  if (!executiveDecisionDirective(prompt) && !securityScenario) return []
  const parsed = parseLocalResult(String(raw ?? ''))
  if (!parsed) return []
  const answer = parsed.answer
  const signals: string[] = []
  if (EXECUTIVE_UNSUPPORTED_CERTAINTY.test(answer)) signals.push('unsupported_certainty')
  if (securityScenario && UNSUPPORTED_SECURITY_FRAMEWORK.test(answer) && !UNSUPPORTED_SECURITY_FRAMEWORK.test(prompt)) signals.push('unsupported_security_framework')
  const suppliedNumbers = new Set((String(prompt).match(/\b\d+(?:[.,]\d+)?\b/g) || []).map(value => value.replace(/[,]/g, '')))
  const novelNumber = (answer.match(/\b\d+(?:[.,]\d+)?\b/g) || []).map(value => value.replace(/[,]/g, '')).find(value => !suppliedNumbers.has(value))
  if (novelNumber) signals.push('novel_numeric_target')
  return signals
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
  // Humor is a material user requirement, not a decorative adjective. Give the same COS
  // reasoner a focused rewrite pass so it produces a real comedic beat rather than merely
  // restating the requested tone or rules.
  if (classifyScriptRequest(prompt) === 'content' && /\\b(?:humou?rous|humou?r|funny|comedic)\\b/i.test(prompt)) return true
  if (contentScriptSemanticMismatch(prompt, raw)) return true
  if (executiveDecisionUnsupportedClaims(prompt, raw).length) return true
  const quality = assessReasonerDraft(prompt, raw)
  if (!quality.parseable || !quality.diagnostic) return false
  if (quality.cap < 0.72) return true
  return quality.genericBuckets >= 2 && quality.mechanisms < 3
}

export function buildDiagnosticRepairPrompt(originalPrompt: string, _firstRaw: string): string {
  const scriptDirective = scriptRequestDirective(originalPrompt)
  if (executiveDecisionDirective(originalPrompt)) {
    return [
      originalPrompt,
      '',
      'QUALITY REPAIR — the prior executive recommendation stated unsupported outcomes or numeric targets.',
      executiveDecisionDirective(originalPrompt),
      '',
      'Rewrite the memo from the supplied facts only.',
      '- Do not say that renewals are safe, cannibalization is low, customers will or will not downgrade, or that a contract guarantees a commercial outcome unless the supplied evidence establishes it.',
      '- Do not add feature limits, timelines, savings targets, percentages, user counts, legal conclusions, or price points that are not in the request.',
      '- Convert unsupported predictions into risks, hypotheses, decision gates, experiments, and measurements; state what evidence would confirm or falsify them.',
      '- Preserve the useful arbitration framework and deliver the complete requested memo.',
      '',
      'Return a fresh answer. Do not mention this repair instruction or the rejected draft.',
    ].join('\n')
  }
  if (scriptDirective && classifyScriptRequest(originalPrompt) === 'content') {
    return [
      originalPrompt,
      '',
      'QUALITY REPAIR — your previous draft did not fully satisfy the requested written script.',
      scriptDirective,
      '',
      'If the user asked for humor, the script must contain an actual restrained comic beat: a concrete situational contrast, escalation, or payoff. Do not merely mention humor, professionalism, policy, or compliance.',
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

  const firstExecutiveSignals = executiveDecisionUnsupportedClaims(prompt, firstRaw)
  const repairedExecutiveSignals = executiveDecisionUnsupportedClaims(prompt, repairedRaw)
  if (firstExecutiveSignals.length !== repairedExecutiveSignals.length) return repairedExecutiveSignals.length < firstExecutiveSignals.length
  if (firstExecutiveSignals.length && repairedExecutiveSignals.length) return false

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
