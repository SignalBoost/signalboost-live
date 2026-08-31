// saas/lib/ai/cos/freshEvidenceSynthesisContract.ts
import { freshEvidenceGroundingBlock, type FreshEvidenceSource } from './cosFreshGrounding.ts'
import { replyCitesRequiredFreshEvidence } from './cosFreshAuthority.ts'

export type FreshEvidenceSemanticScope = {
  scopeId: string
  label: string
  finding: string
  evidenceIds: string[]
}

export type FreshEvidencePresentationMode = 'direct' | 'neutral_evidence_map'

export type FreshEvidenceSemanticPlan = {
  presentationMode: FreshEvidencePresentationMode
  directBinaryAnswerSafe: boolean
  scopes: FreshEvidenceSemanticScope[]
}

export type FreshEvidenceFaithfulnessReview = {
  faithful: boolean
  missingScopeIds: string[]
  collapsedScopeIds: string[]
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
  presentationMode?: unknown
  directBinaryAnswerSafe?: unknown
  scopes?: unknown
}

type ModelFreshEvidenceFaithfulnessReview = {
  faithful?: unknown
  missingScopeIds?: unknown
  collapsedScopeIds?: unknown
}

export const SINGLE_PROPOSITION_SOURCE_LIMIT = 2
export const SINGLE_PROPOSITION_ANSWER_CHAR_LIMIT = 650
const MAX_SEMANTIC_SCOPES = 5
const SCOPE_ID = /^[A-Za-z0-9_-]{1,32}$/
const BINARY_LEAD = /^\s*(?:yes|no|sí|si|não|nao|tak|nie|да|нет)(?:\s|[,.!:;?—–-]|$)/iu

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
    'Return ONLY strict JSON with this exact shape: {"presentationMode":"direct","directBinaryAnswerSafe":true,"scopes":[{"scopeId":"S1","label":"...","finding":"...","evidenceIds":["LIVE1"]}]}.',
    'presentationMode must be exactly "direct" or "neutral_evidence_map".',
    'Do not write the user-facing answer and do not expose chain-of-thought. Return only concise scope-level conclusions.',
    'Use only facts present in LIVE EVIDENCE. Your model memory is not a source of current facts.',
    'Infer the proposition from QUESTION, not from search wording, source headlines, or retrieval order.',
    'Determine how each source operationalizes the key predicate or quantity the user is asking about.',
    'Treat materially different constructs, populations, denominators, units, time windows, comparison bases, controls, outcome definitions, methods, or interpretive claims as distinct scopes when combining them would change what a conclusion means.',
    'Never treat estimates as one numerical range, average, trend, or pooled finding unless their population, denominator, unit, time basis, and control structure are genuinely commensurable.',
    'A surface predicate can hide multiple materially different propositions even when sources do not literally disagree. In particular, keep a descriptive difference or association distinct from explanation, causation, intent, discriminatory treatment, or a legal/normative violation.',
    'An observed group-level disparity or adjusted residual does not by itself establish why the difference exists, that group membership caused it, that an actor intended it, or that any conduct was unlawful. Those stronger propositions require their own evidence.',
    'When LIVE EVIDENCE names both compositional or behavioral factors (occupation, hours, experience, selection, career interruption) and a residual association with the grouping attribute, keep those as distinct scopes. The grouping attribute may be one contributing factor; it is not the whole explanation unless the evidence isolates it.',
    'If the user asks one yes/no question with an umbrella term that reasonably spans both a descriptive proposition and a stronger causal, intentional, discriminatory, or legal proposition, set presentationMode="neutral_evidence_map" and directBinaryAnswerSafe=false even when the descriptive evidence is internally consistent.',
    'If materially different control structures, comparison bases, or operational definitions answer different readings of the user’s wording, a single yes/no verdict is not safe unless the QUESTION itself clearly limits the meaning to one of those readings.',
    'When credible sources materially diverge in method, definition, interpretation, causal attribution, or conclusion, preserve those divergent evidence-backed views as separate scopes. Do not choose a side for the user.',
    'Set presentationMode="neutral_evidence_map" when a fair answer must present material evidence-backed divergence OR materially different plausible meanings of the user’s predicate before the reader can decide what conclusion follows.',
    'For presentationMode="neutral_evidence_map", directBinaryAnswerSafe MUST be false. A neutral evidence map must never begin with a yes/no verdict because that pre-adjudicates the evidence or the meaning of the predicate.',
    'Set presentationMode="direct" only when the evidence supports one clearly operationalized factual proposition and a direct orientation cannot reasonably be mistaken for a stronger causal, intentional, discriminatory, or legal conclusion.',
    'Do not infer presentationMode from scope count. A direct answer can have several compatible scopes, and a neutral evidence map can arise from one ambiguous or contested interpretation.',
    'Do not manufacture false balance: a materially divergent view must have actual evidence in LIVE EVIDENCE, and stronger evidence may be described as stronger without telling the user what to believe.',
    'Set directBinaryAnswerSafe=false whenever a bare yes/no would hide material divergence, definitional ambiguity, a descriptive-vs-causal distinction, or materially overstate what the evidence supports, even if only one evidence scope is needed.',
    'Set directBinaryAnswerSafe=true only in presentationMode="direct", when a direct yes/no is supported and can remain truthful without implying a stronger proposition than the evidence establishes.',
    'Choose scope count separately from binary safety and presentation mode: return the smallest set of materially distinct scopes needed to preserve meaning.',
    'Each scope label must identify what is actually measured, compared, established, or argued. Each finding must state only the evidence-supported conclusion for that scope.',
    'Every scope must cite at least one real LIVE evidence id that supports its finding. Never invent an evidence id.',
    'Do not manufacture a second scope merely to be cautious. Split only when the evidence or the user’s materially different plausible meanings make the distinction necessary.',
  ].join('\n')
}

export function freshEvidenceScopePlanPrompt(args: {
  input: string
  sources: FreshEvidenceSource[]
  retrievedAt: string
}): string {
  return `${freshEvidenceGroundingBlock(args.input, args.sources, args.retrievedAt)}\n\nSCOPE-PLANNING TASK:\nIdentify the smallest set of materially distinct evidence scopes required to answer the original QUESTION without changing the meaning of what the evidence establishes. Preserve genuine methodological or interpretive divergence and distinguish a descriptive observation from any stronger causal, intentional, discriminatory, or legal interpretation. Choose whether the user should receive a direct factual orientation or a neutral evidence map before any verdict.\n\nQUESTION: ${args.input}`
}

export function acceptFreshEvidenceSemanticPlan(args: {
  text: string
  sources: FreshEvidenceSource[]
}): FreshEvidenceSemanticPlan | null {
  const parsed = parseJsonObject(args.text) as ModelFreshEvidenceSemanticPlan | null
  const presentationMode = parsed?.presentationMode
  if (presentationMode !== 'direct' && presentationMode !== 'neutral_evidence_map') return null
  if (typeof parsed?.directBinaryAnswerSafe !== 'boolean' || !Array.isArray(parsed?.scopes)) return null
  if (presentationMode === 'neutral_evidence_map' && parsed.directBinaryAnswerSafe) return null
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

  return { presentationMode, directBinaryAnswerSafe: parsed.directBinaryAnswerSafe, scopes }
}

export function freshEvidenceSynthesisSystemPrompt(language: string): string {
  return [
    `Answer in ${languageLabel(language)}.`,
    'You are the ANSWER SYNTHESIS PASS for LIVE EVIDENCE. A prior neural scope planner has already identified the semantic scopes and presentation mode that the answer must preserve.',
    'Return ONLY strict JSON with this exact shape: {"answer":"...","evidenceIds":["LIVE1","LIVE2"],"scopeIds":["S1","S2"]}.',
    'Use ONLY facts present in LIVE EVIDENCE. Your own memory is assumed stale and must not contribute facts.',
    'The SEMANTIC SCOPE PLAN is a prior model conclusion about how to keep evidence meanings distinct; it is not additional factual evidence.',
    'Be neutral. Describe what the strongest relevant sources measure, find, or argue; do not advocate a side or tell the user what to believe.',
    'When credible sources materially diverge, present the strongest representative evidence-backed positions or measurements fairly and explain the methodological or definitional reason for the divergence when the evidence supports it.',
    'Do not create false balance. If a view lacks credible support in LIVE EVIDENCE, do not invent it merely to appear neutral. You may describe evidence quality or source directness without choosing a belief for the user.',
    'Answer the user’s proposition, not the retrieval set. Abstract across redundant sources before writing.',
    'Preserve the scope plan. Do not collapse materially distinct scopes or materially different meanings of the user’s predicate into one stronger claim.',
    'Never combine non-commensurable numbers into one range, average, trend, or summary statistic. Keep each number attached to its population, denominator, unit, time period, comparison basis, and control structure.',
    'If two sources report different numbers because they measure different things, say so explicitly instead of presenting the numbers as disagreement about one identical quantity.',
    'Keep descriptive evidence separate from explanation, causation, intent, discrimination, and legal conclusions. A statistical disparity, association, or adjusted residual may establish a measured difference; it does not by itself establish why the difference exists or that unlawful treatment occurred.',
    'If the evidence establishes a descriptive difference but does not establish a stronger causal, intentional, discriminatory, or legal interpretation, state that boundary explicitly rather than letting the descriptive result stand in for the stronger claim.',
    'If LIVE EVIDENCE attributes part of a group disparity to occupation, hours, experience, selection, or similar factors and part to a residual association with the grouping attribute, say both. Do not write that the grouping attribute is the only reason, and do not write that it is irrelevant.',
    'If presentationMode="neutral_evidence_map", NEVER begin with yes/no or a single verdict. Begin with the evidence/meaning split itself: what is measured, what a narrower or adjusted comparison establishes, and what stronger explanation or legal conclusion is not established by those statistics alone.',
    'If presentationMode="direct" and directBinaryAnswerSafe=false, do not open with a standalone yes or no. State the scoped evidence directly.',
    'If presentationMode="direct" and directBinaryAnswerSafe=true, a direct yes/no is allowed only as a narrow factual orientation and must not imply a stronger causal, intentional, discriminatory, or legal conclusion.',
    'Use every scope id needed by the plan and cite evidence ids that actually support those scopes. Never invent a scope id or evidence id.',
    'Distinguish observation from explanation and causation; do not promote an aggregate, associative, modeled, or otherwise bounded result beyond the scope that the evidence supports.',
    'Prefer direct or primary evidence for a scope when available, plus strong independent corroboration when useful. Do not cite a tertiary summary merely to add another source if stronger sources already support the same point.',
    'Prefer the minimum representative evidence needed for each scope. Do not enumerate parallel statistics or sources merely because they were retrieved.',
    'Be concise and natural. For genuine divergence or predicate ambiguity, a compact evidence map is better than a verdict: what is observed, what an adjusted/narrower comparison says, what remains unexplained, and what the evidence does not establish.',
    'If the evidence cannot support the required scopes, return {"answer":"EVIDENCE_INSUFFICIENT","evidenceIds":[],"scopeIds":[]}.',
  ].join('\n')
}

export function freshEvidenceSynthesisPrompt(args: {
  input: string
  sources: FreshEvidenceSource[]
  retrievedAt: string
  semanticPlan: FreshEvidenceSemanticPlan
}): string {
  return `${freshEvidenceGroundingBlock(args.input, args.sources, args.retrievedAt)}\n\nSEMANTIC SCOPE PLAN (neural conclusion, not factual evidence):\n${JSON.stringify(args.semanticPlan)}\n\nANSWER TASK:\nFollow presentationMode exactly. For neutral_evidence_map, lead with the evidence and meaning split, never a yes/no verdict. Preserve every material scope, keep non-commensurable measurements separate, distinguish descriptive observations from stronger causal/intentional/discriminatory/legal interpretations, and let the user decide what to believe.\n\nQUESTION: ${args.input}`
}

/**
 * Neural answer critic. It does not produce prose or new facts; it checks whether the answer actually
 * preserves the model-declared scope distinctions rather than merely echoing their IDs.
 */
export function freshEvidenceFaithfulnessReviewSystemPrompt(language: string): string {
  return [
    `Evaluate the answer written in ${languageLabel(language)}.`,
    'You are the SCOPE-FAITHFULNESS AND NEUTRALITY REVIEWER for a live-evidence answer.',
    'Return ONLY strict JSON with this exact shape: {"faithful":true,"missingScopeIds":[],"collapsedScopeIds":[]}.',
    'Do not rewrite the answer and do not expose chain-of-thought.',
    'Use QUESTION, LIVE EVIDENCE, SEMANTIC SCOPE PLAN, and CANDIDATE ANSWER only.',
    'Independently evaluate whether the answer’s opening and framing are semantically safe; do not blindly defer to directBinaryAnswerSafe when the QUESTION uses an umbrella predicate with materially different descriptive, causal, intentional, discriminatory, or legal readings.',
    'Mark faithful=false if a required scope is absent, materially weakened, or merged with another scope so that the answer implies a stronger or different proposition than the evidence supports.',
    'Mark faithful=false if a yes/no lead can reasonably be read as applying to a stronger causal, intentional, discriminatory, or legal proposition while the cited evidence establishes only a descriptive, associative, aggregate, or adjusted statistical difference. Put every affected real scope id in collapsedScopeIds.',
    'Mark faithful=false if presentationMode="neutral_evidence_map" and the answer opens with yes/no, a winner/loser verdict, or any single conclusion that pre-adjudicates the divergent evidence or predicate meaning before mapping it.',
    'Mark faithful=false if the answer blends non-commensurable estimates into one range, average, trend, consensus statistic, or other synthetic number.',
    'Mark faithful=false if a number is detached from a material difference in population, denominator, unit, time basis, comparison basis, controls, or outcome definition.',
    'Mark faithful=false if genuine evidence-backed divergence is converted into advocacy, a winner/loser verdict, or a statement telling the user what to believe.',
    'Mark faithful=false if the answer creates false balance by presenting an unsupported position as though it had evidence comparable to a supported one.',
    'Mark faithful=false if the answer says or implies that a measured disparity or adjusted residual proves motive, intent, causation, discrimination, or illegality without direct evidence for that stronger proposition.',
    'Mark faithful=false if a tertiary summary is used to characterize a scope while stronger direct evidence in LIVE EVIDENCE materially contradicts or supersedes that characterization.',
    'missingScopeIds contains required scopes whose conclusion is not represented in the answer.',
    'collapsedScopeIds contains the scope ids involved when distinct scopes or distinct predicate meanings are blended, made numerically commensurable without basis, or one is presented as if it proves the other.',
    'If faithful=true, both arrays must be empty. If faithful=false, at least one array must contain a real scope id from the plan.',
    'Do not invent scope ids and do not judge verbosity or raw citation count here.',
  ].join('\n')
}

export function freshEvidenceFaithfulnessReviewPrompt(args: {
  input: string
  sources: FreshEvidenceSource[]
  retrievedAt: string
  semanticPlan: FreshEvidenceSemanticPlan
  answer: string
}): string {
  return `${freshEvidenceGroundingBlock(args.input, args.sources, args.retrievedAt)}\n\nSEMANTIC SCOPE PLAN:\n${JSON.stringify(args.semanticPlan)}\n\nCANDIDATE ANSWER:\n${String(args.answer || '').trim()}\n\nREVIEW TASK:\nIndependently check whether the candidate follows presentationMode and whether any binary lead improperly collapses a descriptive observation into a stronger causal, intentional, discriminatory, or legal claim. Preserve every material scope, keep incompatible measurements separate, represent genuine divergence neutrally, avoid false balance, and stay within what the cited evidence establishes.\n\nQUESTION: ${args.input}`
}

export function acceptFreshEvidenceFaithfulnessReview(args: {
  text: string
  semanticPlan: FreshEvidenceSemanticPlan
}): FreshEvidenceFaithfulnessReview | null {
  const parsed = parseJsonObject(args.text) as ModelFreshEvidenceFaithfulnessReview | null
  if (typeof parsed?.faithful !== 'boolean') return null
  const validScopeIds = new Set(args.semanticPlan.scopes.map(scope => scope.scopeId))
  const missingScopeIds = uniqueStrings(parsed.missingScopeIds)
  const collapsedScopeIds = uniqueStrings(parsed.collapsedScopeIds)
  if (missingScopeIds.some(id => !validScopeIds.has(id)) || collapsedScopeIds.some(id => !validScopeIds.has(id))) return null
  if (parsed.faithful && (missingScopeIds.length || collapsedScopeIds.length)) return null
  if (!parsed.faithful && !missingScopeIds.length && !collapsedScopeIds.length) return null
  return { faithful: parsed.faithful, missingScopeIds, collapsedScopeIds }
}

/**
 * Compatibility hook retained for the existing synthesis state machine.
 * Output density is a presentation-quality preference, never a verification/release gate.
 * Concision and representative-source selection remain neural prompt instructions; a grounded,
 * citation-valid, scope-faithful answer must not fail closed because it is long or cites many sources.
 */
export function freshEvidenceSynthesisNeedsNeuralReview(_args: {
  answer: string
  citedSourceIds: string[]
  singleProposition: boolean
  semanticPlan: FreshEvidenceSemanticPlan
}): boolean {
  return false
}

export function freshEvidenceRevisionSystemPrompt(language: string): string {
  return [
    `Answer in ${languageLabel(language)}.`,
    'You are the FINAL NEURAL REPAIR/EDIT PASS for a grounded live-evidence answer.',
    'Return ONLY strict JSON with this exact shape: {"answer":"...","evidenceIds":["LIVE1","LIVE2"],"scopeIds":["S1","S2"]}.',
    'Re-reason from QUESTION, LIVE EVIDENCE, and the existing SEMANTIC SCOPE PLAN. The prior DRAFT is not evidence.',
    'Preserve every required scope. Never collapse multiple scopes into one conclusion.',
    'If a SCOPE-FAITHFULNESS REVIEW is supplied, repair every listed missing or collapsed scope while keeping each conclusion within the evidence.',
    'Remain neutral when credible sources diverge: represent their evidence-backed positions or measurements and let the user decide what to believe.',
    'Never create a range, average, trend, or pooled number from non-commensurable measurements. Restore the population, denominator, unit, time basis, comparison basis, and controls needed to keep unlike estimates separate.',
    'Do not create false balance, and do not turn stronger evidence into advocacy. Describe relative evidence quality or source directness without choosing a belief for the user.',
    'If presentationMode="neutral_evidence_map", never begin with yes/no or a verdict. Lead with the evidence/meaning split itself.',
    'If presentationMode="direct" and directBinaryAnswerSafe=false, do not open with a standalone yes or no.',
    'If the SCOPE-FAITHFULNESS REVIEW identifies that a binary lead collapsed a descriptive observation into a stronger causal, intentional, discriminatory, or legal proposition, REMOVE the binary lead even when directBinaryAnswerSafe=true. directBinaryAnswerSafe permits a binary lead; it never requires one.',
    'Keep measured disparities or adjusted residuals separate from claims about explanation, cause, motive, discriminatory treatment, or illegality unless LIVE EVIDENCE directly establishes those stronger claims.',
    'Prefer direct/primary evidence and strong independent corroboration over redundant tertiary summaries.',
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
  faithfulnessReview?: FreshEvidenceFaithfulnessReview | null
}): string {
  const reviewBlock = args.faithfulnessReview
    ? `\n\nSCOPE-FAITHFULNESS REVIEW (neural verdict, not factual evidence):\n${JSON.stringify(args.faithfulnessReview)}`
    : ''
  return `${freshEvidenceGroundingBlock(args.input, args.sources, args.retrievedAt)}\n\nSEMANTIC SCOPE PLAN (must be preserved unless the reviewer has shown that the draft’s binary lead collapsed materially different meanings):\n${JSON.stringify(args.semanticPlan)}${reviewBlock}\n\nDRAFT TO REPAIR/EDIT (not evidence):\n${String(args.draftAnswer || '').trim()}\n\nREPAIR TASK:\nRewrite neutrally and concisely while preserving each required scope as a distinct bounded conclusion. For neutral_evidence_map, lead with the evidence/meaning split rather than yes/no. If the reviewer flagged a binary-lead semantic collapse, remove that lead even if the plan allowed it. Keep incompatible measurements separate and keep descriptive observations distinct from stronger causal, intentional, discriminatory, or legal interpretations.\n\nQUESTION: ${args.input}`
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
  if ((args.semanticPlan.presentationMode === 'neutral_evidence_map' || !args.semanticPlan.directBinaryAnswerSafe) && BINARY_LEAD.test(answer)) return null

  const byId = new Map(args.sources.map(source => [source.id, source] as const))
  const rawEvidenceIds = uniqueStrings(parsed?.evidenceIds)
  const citedSourceIds = rawEvidenceIds.filter(id => byId.has(id))
  if (!citedSourceIds.length || citedSourceIds.length !== rawEvidenceIds.length) return null

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
