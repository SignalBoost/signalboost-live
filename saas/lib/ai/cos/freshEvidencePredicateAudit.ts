import { freshEvidenceGroundingBlock, type FreshEvidenceSource } from './cosFreshGrounding.ts'
import type { FreshEvidenceSemanticPlan } from './freshEvidenceSynthesisContract.ts'

export type FreshEvidencePredicateAmbiguityKind =
  | 'definition_or_construct'
  | 'population_or_denominator'
  | 'comparison_or_controls'
  | 'descriptive_vs_causal'
  | 'causal_vs_intent'
  | 'factual_vs_legal'
  | 'methodological_divergence'
  | 'other_material_reading'

export type FreshEvidencePredicateAudit = {
  binaryVerdictSafe: boolean
  requiresNeutralEvidenceMap: boolean
  ambiguityKinds: FreshEvidencePredicateAmbiguityKind[]
}

type ModelFreshEvidencePredicateAudit = {
  binaryVerdictSafe?: unknown
  requiresNeutralEvidenceMap?: unknown
  ambiguityKinds?: unknown
}

const ALLOWED_AMBIGUITY_KINDS = new Set<FreshEvidencePredicateAmbiguityKind>([
  'definition_or_construct',
  'population_or_denominator',
  'comparison_or_controls',
  'descriptive_vs_causal',
  'causal_vs_intent',
  'factual_vs_legal',
  'methodological_divergence',
  'other_material_reading',
])

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

/**
 * Independent binary-release audit. It deliberately receives QUESTION + LIVE EVIDENCE only: no
 * scope-plan verdict and no candidate answer. This prevents the second neural decision from simply
 * echoing the first. It is an adversarial semantic check, not chain-of-thought generation.
 */
export function freshEvidencePredicateAuditSystemPrompt(language: string): string {
  return [
    `Return only the audit fields in ${languageLabel(language)}-independent JSON; ambiguityKinds must use the fixed English enum values below.`,
    'You are the INDEPENDENT BINARY-VERDICT ADVERSARIAL AUDITOR for a live-evidence question.',
    'Return ONLY strict JSON with this exact shape: {"binaryVerdictSafe":false,"requiresNeutralEvidenceMap":true,"ambiguityKinds":["descriptive_vs_causal"]}.',
    'Do not write an answer, do not expose chain-of-thought, and do not assume a prior planner or draft exists.',
    'Use QUESTION to identify what an ordinary reader could reasonably understand the key predicate to mean. Use LIVE EVIDENCE only to see which operational meanings are actually measured or established.',
    'Approve binaryVerdictSafe=true only when the QUESTION clearly asks one operationally unambiguous factual proposition and a leading yes/no cannot reasonably be read as asserting a materially different or stronger proposition.',
    'Act adversarially against overclaiming. If a reasonable reader could take the same surface label to mean either a descriptive difference/association OR a stronger explanation, cause, intent, unequal treatment because of group membership, wrongdoing, normative judgment, or legal violation, binaryVerdictSafe=false and requiresNeutralEvidenceMap=true.',
    'A measured population disparity, aggregate difference, association, or adjusted residual is descriptive evidence. It does not by itself establish why the difference exists, that a protected or group characteristic caused treatment, that an actor intended the outcome, or that conduct was unlawful.',
    'Different populations, denominators, units, time bases, comparison groups, controls, definitions, or methodologies can also make one yes/no verdict unsafe when the QUESTION does not explicitly choose one meaning.',
    'Do not manufacture ambiguity merely because multiple sources or estimates exist. If all material readings resolve to the same narrowly defined proposition and no stronger reading is reasonably implied, binaryVerdictSafe may be true.',
    'Do not manufacture false balance. This audit asks whether binary framing is semantically safe, not whether every imaginable opinion deserves equal weight.',
    'Allowed ambiguityKinds are exactly: definition_or_construct, population_or_denominator, comparison_or_controls, descriptive_vs_causal, causal_vs_intent, factual_vs_legal, methodological_divergence, other_material_reading.',
    'If binaryVerdictSafe=true, requiresNeutralEvidenceMap must be false and ambiguityKinds must be empty.',
    'If binaryVerdictSafe=false, requiresNeutralEvidenceMap must be true and ambiguityKinds must contain at least one applicable allowed value.',
  ].join('\n')
}

export function freshEvidencePredicateAuditPrompt(args: {
  input: string
  sources: FreshEvidenceSource[]
  retrievedAt: string
}): string {
  return `${freshEvidenceGroundingBlock(args.input, args.sources, args.retrievedAt)}\n\nINDEPENDENT AUDIT TASK:\nWithout seeing or trusting any prior semantic plan or answer, decide whether a leading yes/no verdict is semantically safe for the QUESTION. Look specifically for materially different operational meanings and for descriptive evidence being mistaken for stronger causal, intentional, discriminatory, normative, or legal claims.\n\nQUESTION: ${args.input}`
}

export function acceptFreshEvidencePredicateAudit(text: string): FreshEvidencePredicateAudit | null {
  const parsed = parseJsonObject(text) as ModelFreshEvidencePredicateAudit | null
  if (typeof parsed?.binaryVerdictSafe !== 'boolean' || typeof parsed?.requiresNeutralEvidenceMap !== 'boolean') return null
  if (!Array.isArray(parsed.ambiguityKinds)) return null

  const ambiguityKinds: FreshEvidencePredicateAmbiguityKind[] = []
  for (const raw of parsed.ambiguityKinds) {
    const kind = String(raw || '') as FreshEvidencePredicateAmbiguityKind
    if (!ALLOWED_AMBIGUITY_KINDS.has(kind) || ambiguityKinds.includes(kind)) return null
    ambiguityKinds.push(kind)
  }

  if (parsed.binaryVerdictSafe) {
    if (parsed.requiresNeutralEvidenceMap || ambiguityKinds.length) return null
  } else if (!parsed.requiresNeutralEvidenceMap || !ambiguityKinds.length) {
    return null
  }

  return {
    binaryVerdictSafe: parsed.binaryVerdictSafe,
    requiresNeutralEvidenceMap: parsed.requiresNeutralEvidenceMap,
    ambiguityKinds,
  }
}

function neutralEvidenceMap(semanticPlan: FreshEvidenceSemanticPlan): FreshEvidenceSemanticPlan {
  return {
    ...semanticPlan,
    presentationMode: 'neutral_evidence_map',
    directBinaryAnswerSafe: false,
  }
}

/**
 * Three-key binary-release rule:
 * 1) the neural planner says binary framing is safe,
 * 2) the planner declared exactly one material semantic scope, and
 * 3) an independent neural audit separately affirms binary safety.
 *
 * The server does not infer what the scopes mean. It trusts the planner's own declaration that scopes
 * are materially distinct, then applies a presentation rule: multiple material scopes are evidence-map
 * territory and cannot be compressed into a yes/no headline. Missing/unparseable audit is likewise no
 * second neural key, so the answer remains available but is forced to evidence-first presentation.
 */
export function applyFreshEvidencePredicateAudit(
  semanticPlan: FreshEvidenceSemanticPlan,
  audit: FreshEvidencePredicateAudit | null,
): FreshEvidenceSemanticPlan {
  if (semanticPlan.presentationMode === 'neutral_evidence_map' || !semanticPlan.directBinaryAnswerSafe) return semanticPlan
  if (semanticPlan.scopes.length !== 1) return neutralEvidenceMap(semanticPlan)
  if (audit?.binaryVerdictSafe === true && audit.requiresNeutralEvidenceMap === false && audit.ambiguityKinds.length === 0) {
    return semanticPlan
  }
  return neutralEvidenceMap(semanticPlan)
}
