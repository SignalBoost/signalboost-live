import { assessAnswerSpecificity } from './answerSpecificity.ts'
import { parseLocalResult } from './reasonerOutput.ts'
import { classifyScriptRequest, executiveDecisionDirective, scriptRequestDirective } from './scriptRequestIntent.ts'
import { creativeConstraintRepairInstruction, unsupportedCreativeConstraintClaims } from './creativeConstraintFidelity.ts'
import { isPowerStabilizationPrompt, powerStabilizationDefects, powerStabilizationRepairInstruction } from './powerStabilizationRelease.ts'
import { isAdvisoryDiagnosisPrompt } from './advisoryDiagnosisPolicy.ts'

const CODE_SHAPED_ANSWER = /```\s*(?:python|py|javascript|js|typescript|ts|bash|shell|powershell|ruby|php|java|c\+\+|c#|go|rust)?\b|\b(?:import\s+[A-Za-z_][\w.]*|from\s+[A-Za-z_][\w.]*\s+import\s+|class\s+[A-Za-z_]\w*\s*[:({]|def\s+[A-Za-z_]\w*\s*\(|function\s+[A-Za-z_$]\w*\s*\(|if\s+__name__\s*==|console\.log\s*\(|npm\s+(?:run|install)|#!\/(?:usr\/bin\/env\s+)?(?:bash|sh|python))\b/m
const PROGRAMMING_REDIRECT = /\b(?:programming language|source code|python|javascript|typescript|bash|powershell|choose (?:a |the )?(?:language|runtime)|specify (?:a |the )?(?:language|runtime|format))\b/i
const CONTENT_SCRIPT_REFUSAL = /\b(?:a single script cannot be written|cannot write (?:a |the )?script|can't write (?:a |the )?script|unable to write (?:a |the )?script|need you to specify|need more information before (?:i can |i )?(?:write|produce|draft|create))\b/i
const EXECUTIVE_UNSUPPORTED_CERTAINTY = /\b(?:risk of (?:cannibali[sz]ation|downgrad(?:e|ing)) is low|(?:renewals?|contracts?) (?:are|is) safe|(?:clients?|customers?) will not (?:downgrade|leave)|must (?:stay|remain) on (?:enterprise|the enterprise tier)|cannot (?:practically )?(?:move|downgrade)|is (?:safe|manageable) because)\b/i
const SECURITY_SCENARIO = /\b(?:zero[- ]day|vulnerabilit|tenant\s+metadata|infosec|security\s+lead)\b/i
const UNSUPPORTED_SECURITY_FRAMEWORK = /\b(?:IL[2456]|impact\s+level\s*[2456]|authorizing\s+official|system\s+security\s+plan|\bSSP\b|fedramp|rmf|nist\s*800[- ]53)\b/i
const QUANTITATIVE_TASK = /\b(?:calculate|compute|quantif(?:y|ication)|break[- ]even|overhead|cost\s+savings?|power\s+cost|bandwidth|throughput|latency|checkpoint|synchroni[sz]ation|equation|formula|exact)\b/i
const ECHO_MIN_PROMPT_CHARS = 180
const ECHO_MIN_ANSWER_CHARS = 60
const ECHO_STOPWORDS = new Set([
  'a','an','the','and','or','but','to','of','in','on','for','with','from','by','as','at','is','are','was','were','be','been','being','this','that','these','those','it','its','into','versus','vs','using','use','needed','need','define','calculate',
])

function latestUserRequest(prompt: string): string {
  const text = String(prompt || '').trim()
  const markers = [
    'CURRENT USER INPUT (QUESTION, STATEMENT, OR PASTED TEXT):',
    'CURRENT USER INPUT:',
    'USER REQUEST:',
    'USER QUESTION:',
    'USER INSTRUCTION:',
  ]
  let bestIndex = -1
  let bestMarker = ''
  for (const marker of markers) {
    const index = text.lastIndexOf(marker)
    if (index > bestIndex) {
      bestIndex = index
      bestMarker = marker
    }
  }
  let request = (bestIndex >= 0 ? text.slice(bestIndex + bestMarker.length) : text).trim()
  request = request.replace(/\n\n(?:Answer the public user now\.|Return the corrected answer now\.|Write your reply now\.)[\s\S]*$/i, '').trim()
  return request.slice(0, 16_000)
}

function allTokens(text: string): string[] {
  return (String(text || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(Boolean)
}

function contentTokens(text: string): string[] {
  return allTokens(text).filter(token => token.length > 1 && !ECHO_STOPWORDS.has(token))
}

function ngramOverlap(answerTokens: string[], promptTokens: string[], size = 4): number {
  if (answerTokens.length < size || promptTokens.length < size) return 0
  const promptNgrams = new Set<string>()
  for (let i = 0; i <= promptTokens.length - size; i += 1) {
    promptNgrams.add(promptTokens.slice(i, i + size).join(' '))
  }
  let overlap = 0
  const total = answerTokens.length - size + 1
  for (let i = 0; i <= answerTokens.length - size; i += 1) {
    if (promptNgrams.has(answerTokens.slice(i, i + size).join(' '))) overlap += 1
  }
  return total > 0 ? overlap / total : 0
}

function powerDefectCount(prompt: string, raw: string): number {
  if (!isPowerStabilizationPrompt(latestUserRequest(prompt) || prompt)) return 0
  const parsed = parseLocalResult(String(raw ?? ''))
  const answer = parsed?.answer || String(raw ?? '')
  return powerStabilizationDefects(answer).length
}

export function promptEchoNonAnswer(prompt: string, raw: string): boolean {
  const parsed = parseLocalResult(String(raw ?? ''))
  if (!parsed) return false
  const request = latestUserRequest(prompt)
  const answer = parsed.answer.trim()
  if (request.length < ECHO_MIN_PROMPT_CHARS || answer.length < ECHO_MIN_ANSWER_CHARS) return false
  const requestContent = contentTokens(request)
  const answerContent = contentTokens(answer)
  if (requestContent.length < 12 || answerContent.length < 8) return false
  const requestSet = new Set(requestContent)
  const covered = answerContent.filter(token => requestSet.has(token)).length
  const coverage = covered / answerContent.length
  const novel = new Set(answerContent.filter(token => !requestSet.has(token)))
  const phraseOverlap = ngramOverlap(allTokens(answer), allTokens(request), 4)
  return coverage >= 0.84 && novel.size <= 5 && phraseOverlap >= 0.42
}

export function executiveDecisionUnsupportedClaims(prompt: string, raw: string): string[] {
  const request = latestUserRequest(prompt)
  const securityScenario = SECURITY_SCENARIO.test(request)
  if (!executiveDecisionDirective(request) && !securityScenario) return []
  const parsed = parseLocalResult(String(raw ?? ''))
  if (!parsed) return []
  const answer = parsed.answer
  const signals: string[] = []
  if (EXECUTIVE_UNSUPPORTED_CERTAINTY.test(answer)) signals.push('unsupported_certainty')
  if (securityScenario && UNSUPPORTED_SECURITY_FRAMEWORK.test(answer) && !UNSUPPORTED_SECURITY_FRAMEWORK.test(request)) signals.push('unsupported_security_framework')
  const suppliedNumbers = new Set((request.match(/\b\d+(?:[.,]\d+)?\b/g) || []).map(value => value.replace(/[,]/g, '')))
  const novelNumber = (answer.match(/\b\d+(?:[.,]\d+)?\b/g) || []).map(value => value.replace(/[,]/g, '')).find(value => !suppliedNumbers.has(value))
  if (novelNumber) signals.push('novel_numeric_target')
  return signals
}

/**
 * Only genuine diagnostic/troubleshooting intent receives diagnostic specificity scoring.
 * Failure/status words inside evidence packets, release summaries, or internal prompt envelopes
 * are not diagnostic intent. Reuse the same user-request boundary as advisory diagnosis so the
 * two quality systems cannot drift apart again.
 */
export function promptAppearsDiagnostic(prompt: string): boolean {
  return isAdvisoryDiagnosisPrompt(prompt)
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
  if (!parsed) return { parseable: false, diagnostic, cap: 0, score: 0, genericBuckets: 0, mechanisms: 0 }
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

export function contentScriptSemanticMismatch(prompt: string, raw: string): boolean {
  const request = latestUserRequest(prompt)
  if (classifyScriptRequest(request) !== 'content') return false
  const parsed = parseLocalResult(String(raw ?? ''))
  if (!parsed) return false
  const answer = parsed.answer
  const opening = answer.slice(0, 1200)
  return CODE_SHAPED_ANSWER.test(answer) || PROGRAMMING_REDIRECT.test(opening) || CONTENT_SCRIPT_REFUSAL.test(opening)
}

export function reasonerDraftNeedsRepair(prompt: string, raw: string): boolean {
  const request = latestUserRequest(prompt)
  if (promptEchoNonAnswer(prompt, raw)) return true
  if (unsupportedCreativeConstraintClaims(request, raw).length) return true
  if (classifyScriptRequest(request) === 'content' && /\b(?:humou?rous|humou?r|funny|comedic)\b/i.test(request)) return true
  if (contentScriptSemanticMismatch(prompt, raw)) return true
  if (executiveDecisionUnsupportedClaims(prompt, raw).length) return true
  if (powerDefectCount(prompt, raw) > 0) return true
  const quality = assessReasonerDraft(prompt, raw)
  if (!quality.parseable || !quality.diagnostic) return false
  if (quality.cap < 0.72) return true
  return quality.genericBuckets >= 2 && quality.mechanisms < 3
}

export function buildDiagnosticRepairPrompt(originalPrompt: string, firstRaw: string): string {
  const request = latestUserRequest(originalPrompt)
  const scriptDirective = scriptRequestDirective(request)
  const creativeConstraintRepair = creativeConstraintRepairInstruction(request, firstRaw)
  if (powerDefectCount(originalPrompt, firstRaw) > 0) {
    return [originalPrompt, '', powerStabilizationRepairInstruction(), '', 'Return ONLY strict JSON: {"answer":"...","confidence":0.0}. Do not mention this repair instruction or the rejected draft.'].join('\n')
  }
  if (promptEchoNonAnswer(originalPrompt, firstRaw)) {
    const quantitative = QUANTITATIVE_TASK.test(request)
    return [
      originalPrompt,
      '',
      'QUALITY REPAIR — the prior draft restated or paraphrased the request instead of answering it.',
      'Solve the ORIGINAL user request directly. Do not use the request itself as the answer and do not spend the response apologizing for uncertainty.',
      ...(quantitative ? [
        'This is a quantitative/engineering task. Separate what can be computed from what cannot be computed from the supplied premises.',
        'For every calculable quantity, show the equation, units, and substitution from user-supplied values.',
        'If an exact numeric result requires a missing variable, name the missing input and give the symbolic break-even formula or sensitivity relation instead of inventing a value.',
        'Complete every non-numeric portion that can be answered from general technical reasoning.',
        'Clearly distinguish assumptions from user-supplied facts.',
      ] : [
        'Add substantive reasoning, conclusions, or requested deliverables that are not merely copied from the prompt.',
        'If information is genuinely missing, state the missing input and still complete every part that can be answered without it.',
      ]),
      '',
      'Return ONLY strict JSON: {"answer":"...","confidence":0.0}. Do not mention this repair instruction or the rejected draft.',
    ].join('\n')
  }
  if (creativeConstraintRepair) {
    return [originalPrompt, '', 'QUALITY REPAIR — the prior draft attributed one or more invented requirements to the user.', creativeConstraintRepair, scriptDirective || '', '', 'Return a complete fresh answer to the ORIGINAL request. Preserve the requested generate/critique/rewrite workflow when present. Do not mention this repair instruction or the rejected draft.'].filter(Boolean).join('\n')
  }
  if (executiveDecisionDirective(request)) {
    return [
      originalPrompt,
      '',
      'QUALITY REPAIR — the prior executive recommendation stated unsupported outcomes or numeric targets.',
      executiveDecisionDirective(request),
      '',
      'Rewrite the memo from the supplied facts only.',
      '- Do not state unsupported commercial outcomes as facts.',
      '- Do not add feature limits, timelines, savings targets, percentages, user counts, legal conclusions, or price points absent from the request.',
      '- Convert unsupported predictions into risks, hypotheses, decision gates, experiments, and measurements.',
      '- Preserve the useful arbitration framework and deliver the complete requested memo.',
      '',
      'Return a fresh answer. Do not mention this repair instruction or the rejected draft.',
    ].join('\n')
  }
  if (scriptDirective && classifyScriptRequest(request) === 'content') {
    return [
      originalPrompt,
      '',
      'QUALITY REPAIR — your previous draft did not fully satisfy the requested written script.',
      scriptDirective,
      '',
      'Produce the requested written script now. Keep unknown attributes unknown, do not refuse merely because wording is ambiguous, do not provide programming code, and do not invent factual attributes.',
      '',
      'Return a fresh answer. Do not mention this repair instruction or the rejected draft.',
    ].join('\n')
  }
  if (!promptAppearsDiagnostic(originalPrompt)) {
    return originalPrompt
  }
  return [
    originalPrompt,
    '',
    'QUALITY REPAIR — solve the diagnostic task again from the original facts. Do not copy or defend the rejected draft.',
    'Rank concrete causal mechanisms; explain how each fits the supplied asymmetries; name read-only observables that distinguish and falsify each cause; avoid production mutations; keep confidence proportional to evidence.',
    '',
    'Return a fresh answer. Do not mention this repair instruction or the rejected draft.',
  ].join('\n')
}

export function preferRepairedDraft(prompt: string, firstRaw: string, repairedRaw: string): boolean {
  const firstPower = powerDefectCount(prompt, firstRaw)
  const repairedPower = powerDefectCount(prompt, repairedRaw)
  if (firstPower !== repairedPower) return repairedPower < firstPower
  if (firstPower && repairedPower) return false
  const firstEcho = promptEchoNonAnswer(prompt, firstRaw)
  const repairedEcho = promptEchoNonAnswer(prompt, repairedRaw)
  if (firstEcho !== repairedEcho) return !repairedEcho
  if (firstEcho && repairedEcho) return false
  const request = latestUserRequest(prompt)
  const firstCreativeViolations = unsupportedCreativeConstraintClaims(request, firstRaw)
  const repairedCreativeViolations = unsupportedCreativeConstraintClaims(request, repairedRaw)
  if (firstCreativeViolations.length !== repairedCreativeViolations.length) return repairedCreativeViolations.length < firstCreativeViolations.length
  if (firstCreativeViolations.length && repairedCreativeViolations.length) return false
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
    const fields = [value.code, value.message, value.details, value.hint].filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    if (fields.length) return fields.join(' | ')
    try { return JSON.stringify(error) } catch { /* fall through */ }
  }
  return String(error)
}

export async function recordQualityRepairDecision(input:QualityRepairDecisionInput):Promise<void>{
  try{
    const { cosServiceDb }=await import('@/lib/cos-core/storage/supabase')
    const db=cosServiceDb()
    if(!db)return
    const result=await db.from('cos_quality_repair_decisions').insert({repair_kind:input.repairKind,reasoner_label:input.reasonerLabel,accepted:input.accepted,details:input.details})
    if(result.error)throw result.error
  }catch(error){console.warn('cosReasonerQuality: failed to persist quality-repair decision',qualityRepairPersistenceError(error))}
}
