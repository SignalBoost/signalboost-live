import { freshEvidenceGroundingBlock, type FreshEvidenceSource } from './cosFreshGrounding.ts'
import { replyCitesRequiredFreshEvidence } from './cosFreshAuthority.ts'

export type FreshEvidenceSemanticScope = {
  scopeId: string
  label: string
  finding: string
  evidenceIds: string[]
}

export type FreshEvidenceSemanticPlan = {
  directBinaryAnswerSafe: boolean
  scopes: FreshEvidenceSemanticScope[]
}

export type AcceptedFreshEvidenceSynthesis = {
  reply: string
  citedSourceIds: string[]
  answer: string
  scopeIds: string[]
  semanticPlan: FreshEvidenceSemanticPlan
}

type ModelFreshEvidenceSynthesis = {
  answer?: unknown
  evidenceIds?: unknown
  scopeIds?: unknown
}

type ModelFreshEvidenceSemanticPlan = {
  directBinaryAnswerSafe?: unknown
  scopes?: unknown
}

export const SINGLE_PROPOSITION_SOURCE_LIMIT = 2
export const SINGLE_PROPOSITION_ANSWER_CHAR_LIMIT = 650
const MAX_SEMANTIC_SCOPES = 5
const SCOPE_ID = /^[A-Za-z0-9_-]{1,32}$/
const BINARY_LEAD = /^\s*(?:yes|no|sí|si|não|nao|tak|nie|да|нет)\b[\s,.:;!?-]*/iu

function languageLabel(language: string): string {
  const normalized = String(language || 'en').toLowerCase()
  if (normalized === 'es') return 'Spanish'
  if (normalized === 'pt' || normalized === 'pt-br') return 'Portuguese'
  if (normalized === 'pl') return 'Polish'
  if (normalized === 'ru') return 'Russian'
  return 'English'
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const raw = String(text || '').trim()
  if (!raw) return null
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    const text = String(item || '').trim()
    if (text && !out.includes(text)) out.push(text)
  }
  return out
}

/**
 * First neural pass: infer the semantic shape of the user's proposition before writing an answer.
 * This is a concise model conclusion, not chain-of-thought. Deterministic code validates only the
 * returned structure and evidence references; it never names or chooses the semantic scopes.
 */
export function freshEvidenceScopePlanSystemPrompt(language: string): string {
  return [
    `Return labels and findings in ${languageLabel(language)}.`,
    'You are the SEMANTIC SCOPE PLANNER for LIVE EVIDENCE retrieved moments ago.',
    'Return ONLY strict JSON with this exact shape: {"directBinaryAnswerSafe":true,"scopes":[{"scopeId":"S1","label":"...","finding":"...","evidenceIds":["LIVE1"]}]}.',
    'Do not write the user-facing answer and do not expose chain-of-thought. Return only concise scope-level conclusions.',
    'Use only facts present in LIVE EVIDENCE. Your model memory is not a source of current facts.',
    'Infer the proposition from QUESTION, not from search wording, source headlines, or retrieval order.',
    'Determine how the evidence operationalizes the key predicate or quantity the user is asking about.',
    'Treat materially different constructs, populations, denominators, time windows, comparison bases, controls, or outcome definitions as distinct scopes when combining them would change what a conclusion means.',
    'If one bare yes/no would collapse two or more materially non-equivalent scopes, set directBinaryAnswerSafe=false and return at least two scopes.',
    'If the evidence supports one coherent operationalization for the proposition, set directBinaryAnswerSafe=true and return at least one scope.',
    'Each scope label must describe what is actually being measured or established. Each finding must state the evidence-supported conclusion for that scope, not an explanation of your reasoning process.',
    'Every scope must cite at least one real LIVE evidence id that supports its finding. Never invent an evidence id.',
    'Do not manufacture a second scope merely to be cautious. Split only when the evidence makes the distinction material to the answer.',
  ].join('\n')
}

export function freshEvidenceScopePlanPrompt(args: {
  input: string
  sources: FreshEvidenceSource[]
  retrievedAt: string
}): string {
  return `${freshEvidenceGroundingBlock(args.input, args.sources, args.retrievedAt)}\n\nSCOPE-PLANNING TASK:\nIdentify the smallest set of materially distinct evidence scopes required to answer the original QUESTION without changing the meaning of what the evidence establishes.\n\nQUESTION: ${args.input}`
}

export function acceptFreshEvidenceSemanticPlan(args: {
  text: string
  sources: FreshEvidenceSource[]
}): FreshEvidenceSemanticPlan | null {
  const parsed = parseJsonObject(args.text) as ModelFreshEvidenceSemanticPlan | null
  if (typeof parsed?.directBinaryAnswerSafe !== 'boolean' || !Array.isArray(parsed?.scopes)) return null
  if (!parsed.scopes.length || parsed.scopes.length > MAX_SEMANTIC_SCOPES) return null

  const sourceIds = new Set(args.sources.map(source => source.id))
  const seenScopeIds = new Set<string>()
  const scopes: FreshEvidenceSemanticScope[] = []

  for (const rawScope of parsed.scopes) {
    if (!rawScope || typeof rawScope !== 'object' || Array.isArray(rawScope)) return null
    const scope = rawScope as Record<string, unknown>
    const scopeId = String(scope.scopeId || '').trim()
    const label = String(scope.label || '').trim()
    const finding = String(scope.finding || '').trim()
    const evidenceIds = uniqueStrings(scope.evidenceIds)
    if (!SCOPE_ID.test(scopeId) || seenScopeIds.has(scopeId)) return null
    if (!label || label.length > 180 || !finding || finding.length > 500) return null
    if (!evidenceIds.length || evidenceIds.some(id => !sourceIds.has(id))) return null
    seenScopeIds.add(scopeId)
    scopes.push({ scopeId, label, finding, evidenceIds })
  }

  if (parsed.directBinaryAnswerSafe === false && scopes.length < 2) return null
  return { directBinaryAnswerSafe: parsed.directBinaryAnswerSafe, scopes }
}

export function freshEvidenceSynthesisSystemPrompt(language: string): string {
  return [
    `Answer in ${languageLabel(language)}.`,
    'You are the ANSWER SYNTHESIS PASS for LIVE EVIDENCE. A prior neural scope planner has already identified the semantic scopes that the answer must preserve.',
    'Return ONLY strict JSON with this exact shape: {"answer":"...","evidenceIds":["LIVE1","LIVE2"],"scopeIds":["S1","S2"]}.',
    'Use ONLY facts present in LIVE EVIDENCE. Your own memory is assumed stale and must not contribute facts.',
    'The SEMANTIC SCOPE PLAN is a prior model conclusion about how to keep the evidence meanings distinct; it is not additional factual evidence.',
    'Answer the user’s proposition, not the retrieval set. Abstract across sources before writing.',
    'Preserve the scope plan. Do not collapse materially distinct scopes into one stronger claim.',
    'If directBinaryAnswerSafe=false, do not open with a standalone yes or no. State the scoped conclusions directly so the reader can see which meaning is supported and which stronger or different meaning is not established.',
    'If directBinaryAnswerSafe=true, a direct yes/no is allowed when supported.',
    'Use every scope id needed by the plan and cite evidence ids that actually support those scopes. Never invent a scope id or evidence id.',
    'Distinguish observation from explanation and causation; do not promote an aggregate, associative, modeled, or otherwise bounded result beyond the scope that the evidence supports.',
    'Prefer the minimum representative evidence needed for each scope. Do not enumerate parallel statistics or sources merely because they were retrieved.',
    'Be concise and natural. For a single proposition, normally use one short paragraph unless the scoped distinctions are clearer as two compact sentences.',
    'If the evidence cannot support the required scopes, return {"answer":"EVIDENCE_INSUFFICIENT","evidenceIds":[],"scopeIds":[]}.',
  ].join('\n')
}

export function freshEvidenceSynthesisPrompt(args: {
  input: string
  sources: FreshEvidenceSource[]
  retrievedAt: string
  semanticPlan: FreshEvidenceSemanticPlan
}): string {
  return `${freshEvidenceGroundingBlock(args.input, args.sources, args.retrievedAt)}\n\nSEMANTIC SCOPE PLAN (neural conclusion, not factual evidence):\n${JSON.stringify(args.semanticPlan)}\n\nANSWER TASK:\nWrite the smallest well-supported answer that preserves every material scope in the plan.\n\nQUESTION: ${args.input}`
}

/** Output-density gate only. Semantic ambiguity is handled by the neural scope plan above. */
export function freshEvidenceSynthesisNeedsNeuralReview(args: {
  answer: string
  citedSourceIds: string[]
  singleProposition: boolean
  semanticPlan: FreshEvidenceSemanticPlan
}): boolean {
  if (!args.singleProposition) return false
  const sourceLimit = args.semanticPlan.directBinaryAnswerSafe
    ? SINGLE_PROPOSITION_SOURCE_LIMIT
    : Math.max(SINGLE_PROPOSITION_SOURCE_LIMIT, args.semanticPlan.scopes.length)
  return args.citedSourceIds.length > sourceLimit
    || String(args.answer || '').trim().length > SINGLE_PROPOSITION_ANSWER_CHAR_LIMIT
}

export function freshEvidenceRevisionSystemPrompt(language: string): string {
  return [
    `Answer in ${languageLabel(language)}.`,
    'You are the FINAL NEURAL EDIT PASS for a grounded live-evidence answer that failed only the output-density boundary.',
    'Return ONLY strict JSON with this exact shape: {"answer":"...","evidenceIds":["LIVE1","LIVE2"],"scopeIds":["S1","S2"]}.',
    'Re-reason from QUESTION, LIVE EVIDENCE, and the existing SEMANTIC SCOPE PLAN. The prior DRAFT is not evidence.',
    'Preserve every required scope. Never change directBinaryAnswerSafe or collapse multiple scopes into one conclusion.',
    'If directBinaryAnswerSafe=false, do not open with a standalone yes or no.',
    'Use the minimum representative evidence needed to support the scopes. Remove redundant statistics, examples, and source-by-source narration.',
    'Do not add facts from model memory. Never invent an evidence id or scope id.',
    'If the evidence cannot support the required scopes, return {"answer":"EVIDENCE_INSUFFICIENT","evidenceIds":[],"scopeIds":[]}.',
  ].join('\n')
}

export function freshEvidenceRevisionPrompt(args: {
  input: string
  sources: FreshEvidenceSource[]
  retrievedAt: string
  semanticPlan: FreshEvidenceSemanticPlan
  draftAnswer: string
}): string {
  return `${freshEvidenceGroundingBlock(args.input, args.sources, args.retrievedAt)}\n\nSEMANTIC SCOPE PLAN (must be preserved):\n${JSON.stringify(args.semanticPlan)}\n\nDRAFT THAT FAILED ONLY THE OUTPUT-DENSITY BOUNDARY (not evidence):\n${String(args.draftAnswer || '').trim()}\n\nEDIT TASK:\nRewrite concisely without losing or merging any required scope.\n\nQUESTION: ${args.input}`
}

function answerRespectsRequestedWindow(answer: string, input: string, now = new Date()): boolean {
  const match = String(input || '').match(/\b(?:past|last)\s+(\d{1,3})\s+years?\b/i)
  if (!match) return true
  const startYear = now.getUTCFullYear() - Number(match[1])
  const ranges = [...String(answer || '').matchAll(/\b(\d{4})\s*[–-]\s*(\d{4})?\b/g)]
  return ranges.length >= 2 && ranges.every(range => Number(range[2] || range[1]) >= startYear)
}

export function acceptFreshEvidenceSynthesis(args: {
  text: string
  input: string
  sources: FreshEvidenceSource[]
  semanticPlan: FreshEvidenceSemanticPlan
}): AcceptedFreshEvidenceSynthesis | null {
  const parsed = parseJsonObject(args.text) as ModelFreshEvidenceSynthesis | null
  const answer = typeof parsed?.answer === 'string' ? parsed.answer.trim() : ''
  if (!answer || /EVIDENCE_INSUFFICIENT/i.test(answer)) return null
  if (!answerRespectsRequestedWindow(answer, args.input)) return null
  if (!args.semanticPlan.directBinaryAnswerSafe && BINARY_LEAD.test(answer)) return null

  const byId = new Map(args.sources.map(source => [source.id, source] as const))
  const citedSourceIds = uniqueStrings(parsed?.evidenceIds).filter(id => byId.has(id))
  if (!citedSourceIds.length || citedSourceIds.length !== uniqueStrings(parsed?.evidenceIds).length) return null

  const planScopes = new Map(args.semanticPlan.scopes.map(scope => [scope.scopeId, scope] as const))
  const scopeIds = uniqueStrings(parsed?.scopeIds)
  if (!scopeIds.length || scopeIds.some(scopeId => !planScopes.has(scopeId))) return null

  const requiredScopeIds = args.semanticPlan.directBinaryAnswerSafe
    ? scopeIds
    : args.semanticPlan.scopes.map(scope => scope.scopeId)
  if (!args.semanticPlan.directBinaryAnswerSafe
    && requiredScopeIds.some(scopeId => !scopeIds.includes(scopeId))) return null

  for (const scopeId of scopeIds) {
    const scope = planScopes.get(scopeId)!
    if (!scope.evidenceIds.some(id => citedSourceIds.includes(id))) return null
  }

  const citations = citedSourceIds.map(id => {
    const source = byId.get(id)!
    return `[${source.id}] (${source.url})`
  })
  const reply = `${answer}\n\nSources: ${citations.join(' and ')}`
  if (!replyCitesRequiredFreshEvidence(reply, args.input, args.sources)) return null
  return { reply, citedSourceIds, answer, scopeIds, semanticPlan: args.semanticPlan }
}
