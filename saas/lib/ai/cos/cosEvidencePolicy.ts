import { requiresFreshExternalEvidence } from '@/lib/ai/cos/cosFreshnessPolicy'

export type CosEvidenceMode = 'required' | 'preferred' | 'none'

export type CosEvidencePolicy = {
  mode: CosEvidenceMode
  freshnessRequired: boolean
  reason: string
}

// These are task-shape exemptions, not topic-specific factual allow/deny lists.
// The default for informational requests is to attempt authoritative evidence retrieval.
const TRANSFORMATIVE_OR_CREATIVE = /\b(?:rewrite|edit|proofread|draft|compose|translate|summarize|paraphrase|shorten|expand|brainstorm|invent|imagine|roleplay|write (?:an?|the)|create (?:an?|the)|generate (?:an?|the))\b/i
const CODE_OR_REPO_ACTION = /\b(?:commit|merge|deploy|refactor|implement|write code|change code|patch|fix the code|open (?:a )?pull request|create (?:a )?branch)\b/i
const ANALYTICAL_REASONING = /\b(?:diagnose|troubleshoot|debug|root cause|rank (?:the )?(?:causes|hypotheses)|architect|design (?:an?|the)|reason through|hypothesi[sz]e|without making production changes|what would you check|how would you distinguish)\b/i
const FACT_LOOKUP_LEAD = /^\s*(?:who|when|where|which|what(?:\s+(?:is|are|was|were|does|did|has|have|caused|happened))?|how\s+(?:many|much|old|long|far))\b/i
const VERIFICATION_INTENT = /\b(?:verify|confirm|fact[- ]?check|source|citation|official source|authoritative source|according to)\b/i

/**
 * Generic evidence policy. COS does not enumerate presidents, CEOs, laws, versions,
 * prices, etc. Instead it classifies the TASK SHAPE:
 * - current/volatile facts: authoritative evidence is mandatory;
 * - direct factual lookups/verification: authoritative evidence is mandatory;
 * - other informational questions: evidence retrieval is preferred;
 * - creative/transformative/repo-action/diagnostic reasoning tasks: no external
 *   evidence requirement unless another higher-level subsystem explicitly asks for it.
 */
export function classifyCosEvidencePolicy(input: string): CosEvidencePolicy {
  const text = String(input || '').replace(/\s+/g, ' ').trim()
  if (!text) return { mode: 'none', freshnessRequired: false, reason: 'empty_input' }

  const freshnessRequired = requiresFreshExternalEvidence(text)
  if (freshnessRequired) {
    return { mode: 'required', freshnessRequired: true, reason: 'volatile_external_fact' }
  }

  if (TRANSFORMATIVE_OR_CREATIVE.test(text)) {
    return { mode: 'none', freshnessRequired: false, reason: 'transformative_or_creative_task' }
  }
  if (CODE_OR_REPO_ACTION.test(text)) {
    return { mode: 'none', freshnessRequired: false, reason: 'code_or_repo_action' }
  }
  if (ANALYTICAL_REASONING.test(text)) {
    return { mode: 'none', freshnessRequired: false, reason: 'analytical_reasoning_task' }
  }

  if (FACT_LOOKUP_LEAD.test(text) || VERIFICATION_INTENT.test(text)) {
    return { mode: 'required', freshnessRequired: false, reason: 'externally_verifiable_fact_lookup' }
  }

  // Informational requests default to evidence-preferred rather than memory-first.
  return { mode: 'preferred', freshnessRequired: false, reason: 'informational_evidence_preferred' }
}
