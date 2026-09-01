import { replyCitesRequiredFreshEvidence } from './cosFreshAuthority.ts'
import { freshEvidenceGroundingBlock, type FreshEvidenceSource } from './cosFreshGrounding.ts'
import {
  MAX_SEMANTIC_SCOPE_FINDING_CHARS,
  MAX_SEMANTIC_SCOPE_LABEL_CHARS,
  type FreshEvidenceSemanticPlan,
} from './freshEvidenceSynthesisContract.ts'
import { isNormativePolicyQuestion } from './normativeAnswerPolicy.ts'

export type FreshEvidenceContractFailureCode =
  | 'invalid_json'
  | 'missing_answer'
  | 'model_declared_insufficient'
  | 'unsafe_binary_lead'
  | 'missing_evidence_ids'
  | 'unknown_evidence_ids'
  | 'missing_scope_ids'
  | 'unknown_scope_ids'
  | 'missing_required_scope_ids'
  | 'scope_evidence_lineage_missing'
  | 'normative_source_groups_missing'
  | 'citation_authority_rejected'
  | 'unknown_contract_rejection'

export type FreshEvidencePlanFailureCode =
  | 'invalid_plan_json'
  | 'missing_plan_fields'
  | 'invalid_presentation_mode'
  | 'inconsistent_presentation_mode'
  | 'invalid_scope_count'
  | 'invalid_scope_shape'
  | 'unknown_scope_evidence_ids'

export type FreshEvidenceContractDiagnosis = {
  code: FreshEvidenceContractFailureCode
  repairable: boolean
  draftAnswer: string
}

export type FreshEvidencePlanDiagnosis = {
  code: FreshEvidencePlanFailureCode
  repairable: boolean
}

const BINARY_LEAD = /^\s*(?:yes|no|sí|si|não|nao|tak|nie|да|нет)(?:\s|[,.!:;?—–-]|$)/iu
const SCOPE_ID = /^[A-Za-z0-9_-]{1,32}$/
const MAX_SEMANTIC_SCOPES = 5

function parseObject(text: string): Record<string, unknown> | null {
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
 * Validate only the scope-plan structure, presentation-mode consistency, and evidence lineage.
 * Whether evidence is materially divergent is a neural planner decision; deterministic code must
 * not infer presentation mode or binary safety from the number of scopes returned.
 */
export function diagnoseFreshEvidenceSemanticPlan(args: {
  text: string
  sources: FreshEvidenceSource[]
}): FreshEvidencePlanDiagnosis | null {
  const parsed = parseObject(args.text)
  if (!parsed) return { code: 'invalid_plan_json', repairable: true }
  if (typeof parsed.directBinaryAnswerSafe !== 'boolean' || !Array.isArray(parsed.scopes) || parsed.presentationMode === undefined) {
    return { code: 'missing_plan_fields', repairable: true }
  }
  if (parsed.presentationMode !== 'direct' && parsed.presentationMode !== 'neutral_evidence_map') {
    return { code: 'invalid_presentation_mode', repairable: true }
  }
  if (parsed.presentationMode === 'neutral_evidence_map' && parsed.directBinaryAnswerSafe) {
    return { code: 'inconsistent_presentation_mode', repairable: true }
  }
  if (!parsed.scopes.length || parsed.scopes.length > MAX_SEMANTIC_SCOPES) {
    return { code: 'invalid_scope_count', repairable: true }
  }

  const sourceIds = new Set(args.sources.map(source => source.id))
  const seenScopeIds = new Set<string>()
  for (const rawScope of parsed.scopes) {
    if (!rawScope || typeof rawScope !== 'object' || Array.isArray(rawScope)) {
      return { code: 'invalid_scope_shape', repairable: true }
    }
    const scope = rawScope as Record<string, unknown>
    const scopeId = String(scope.scopeId || '').trim()
    const label = String(scope.label || '').trim()
    const finding = String(scope.finding || '').trim()
    const evidenceIds = uniqueStrings(scope.evidenceIds)
    if (!SCOPE_ID.test(scopeId) || seenScopeIds.has(scopeId)
      || !label || label.length > MAX_SEMANTIC_SCOPE_LABEL_CHARS
      || !finding || finding.length > MAX_SEMANTIC_SCOPE_FINDING_CHARS
      || !evidenceIds.length) {
      return { code: 'invalid_scope_shape', repairable: true }
    }
    if (evidenceIds.some(id => !sourceIds.has(id))) {
      return { code: 'unknown_scope_evidence_ids', repairable: true }
    }
    seenScopeIds.add(scopeId)
  }

  return null
}

export function diagnoseFreshEvidenceSynthesis(args: {
  text: string
  input: string
  sources: FreshEvidenceSource[]
  semanticPlan: FreshEvidenceSemanticPlan
}): FreshEvidenceContractDiagnosis | null {
  const parsed = parseObject(args.text)
  if (!parsed) return { code: 'invalid_json', repairable: true, draftAnswer: String(args.text || '').trim() }
  const answer = typeof parsed.answer === 'string' ? parsed.answer.trim() : ''
  if (!answer) return { code: 'missing_answer', repairable: true, draftAnswer: '' }
  if (/EVIDENCE_INSUFFICIENT/i.test(answer)) {
    return { code: 'model_declared_insufficient', repairable: false, draftAnswer: answer }
  }
  if ((args.semanticPlan.presentationMode === 'neutral_evidence_map' || !args.semanticPlan.directBinaryAnswerSafe) && BINARY_LEAD.test(answer)) {
    return { code: 'unsafe_binary_lead', repairable: true, draftAnswer: answer }
  }

  const byId = new Map(args.sources.map(source => [source.id, source] as const))
  const evidenceIds = uniqueStrings(parsed.evidenceIds)
  if (!evidenceIds.length) return { code: 'missing_evidence_ids', repairable: true, draftAnswer: answer }
  if (evidenceIds.some(id => !byId.has(id))) {
    return { code: 'unknown_evidence_ids', repairable: true, draftAnswer: answer }
  }

  const planScopes = new Map(args.semanticPlan.scopes.map(scope => [scope.scopeId, scope] as const))
  const scopeIds = uniqueStrings(parsed.scopeIds)
  if (!scopeIds.length) return { code: 'missing_scope_ids', repairable: true, draftAnswer: answer }
  if (scopeIds.some(id => !planScopes.has(id))) {
    return { code: 'unknown_scope_ids', repairable: true, draftAnswer: answer }
  }
  if (args.semanticPlan.scopes.length > 1
    && args.semanticPlan.scopes.some(scope => !scopeIds.includes(scope.scopeId))) {
    return { code: 'missing_required_scope_ids', repairable: true, draftAnswer: answer }
  }

  for (const scopeId of scopeIds) {
    const scope = planScopes.get(scopeId)!
    if (!scope.evidenceIds.some(id => evidenceIds.includes(id))) {
      return { code: 'scope_evidence_lineage_missing', repairable: true, draftAnswer: answer }
    }
  }

  if (isNormativePolicyQuestion(args.input)) {
    const supportingIds = [...new Set(args.semanticPlan.scopes
      .filter(scope => scope.position === 'supporting')
      .flatMap(scope => scope.evidenceIds)
      .filter(id => evidenceIds.includes(id)))]
    const opposingIds = [...new Set(args.semanticPlan.scopes
      .filter(scope => scope.position === 'opposing')
      .flatMap(scope => scope.evidenceIds)
      .filter(id => evidenceIds.includes(id)))]
    if (!supportingIds.length || !opposingIds.length
      || !supportingIds.some(id => !opposingIds.includes(id))
      || !opposingIds.some(id => !supportingIds.includes(id))) {
      return { code: 'normative_source_groups_missing', repairable: true, draftAnswer: answer }
    }
  }

  const citations = evidenceIds.map(id => {
    const source = byId.get(id)!
    return `[${source.id}] (${source.url})`
  })
  const reply = `${answer}\n\nSources: ${citations.join(' and ')}`
  if (!replyCitesRequiredFreshEvidence(reply, args.input, args.sources)) {
    return { code: 'citation_authority_rejected', repairable: true, draftAnswer: answer }
  }
  return null
}

export function freshEvidenceScopePlanRepairPrompt(args: {
  input: string
  sources: FreshEvidenceSource[]
  retrievedAt: string
  failedPlanText: string
  failureCode: FreshEvidencePlanFailureCode
}): string {
  return `${freshEvidenceGroundingBlock(args.input, args.sources, args.retrievedAt)}\n\nPREVIOUS SCOPE PLAN (invalid; not evidence):\n${String(args.failedPlanText || '').trim()}\n\nVALIDATION FAILURE: ${args.failureCode}\n\nREPAIR TASK:\nReturn a corrected semantic scope plan under the original scope-planning JSON contract, including presentationMode, directBinaryAnswerSafe, and scopes. Keep each label within ${MAX_SEMANTIC_SCOPE_LABEL_CHARS} characters and each finding within ${MAX_SEMANTIC_SCOPE_FINDING_CHARS} characters. Preserve only materially distinct scopes supported by LIVE EVIDENCE. Decide presentationMode and directBinaryAnswerSafe from the QUESTION and evidence, never from scope count. If presentationMode is neutral_evidence_map, directBinaryAnswerSafe must be false because the user must see the divergent evidence before any verdict. Do not write the user-facing answer.\n\nQUESTION: ${args.input}`
}

export function freshEvidenceAnswerContractRepairPrompt(args: {
  input: string
  sources: FreshEvidenceSource[]
  retrievedAt: string
  semanticPlan: FreshEvidenceSemanticPlan
  failedDraftText: string
  failureCode: FreshEvidenceContractFailureCode
}): string {
  return `${freshEvidenceGroundingBlock(args.input, args.sources, args.retrievedAt)}\n\nSEMANTIC SCOPE PLAN (must be preserved):\n${JSON.stringify(args.semanticPlan)}\n\nPREVIOUS ANSWER OUTPUT (invalid; not evidence):\n${String(args.failedDraftText || '').trim()}\n\nVALIDATION FAILURE: ${args.failureCode}\n\nREPAIR TASK:\nRe-reason from QUESTION and LIVE EVIDENCE and return the exact answer JSON contract with answer, evidenceIds, and scopeIds. Include every material scope in the plan, use only real evidence ids that support those scopes, and do not weaken or bypass the authority/citation requirements. For normative_source_groups_missing, cite at least one source unique to a supporting scope and at least one different source unique to an opposing scope; a source shared by both groups cannot establish balanced provenance by itself. If presentationMode is neutral_evidence_map, do not begin with yes/no or a verdict; lead with the evidence split itself. If directBinaryAnswerSafe is false, do not begin with a standalone yes/no.\n\nQUESTION: ${args.input}`
}
