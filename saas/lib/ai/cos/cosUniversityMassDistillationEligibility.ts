// Keep the TypeScript ready-buffer definition aligned with the paid authorization RPC.
// This module is intentionally pure so the >=50% independent-source admission law can be
// regression-tested without weakening or mocking the production gate.

export const MASS_DISTILLATION_NON_INDEPENDENT_SOURCE_KINDS = Object.freeze([
  'teacher_synthetic_curriculum',
  'teacher_hosted_curriculum',
  'failure_derived_curriculum',
] as const)

export function massDistillationPreparedBatchIsAuthorizable(input: {
  sourceCount: number
  sourceKinds: readonly string[]
}): boolean {
  const sourceCount = Math.max(0, Math.floor(Number(input.sourceCount || 0)))
  if (sourceCount < 1) return false
  const excluded = new Set<string>(MASS_DISTILLATION_NON_INDEPENDENT_SOURCE_KINDS)
  let independent = 0
  let failureDerived = 0
  let nonFailure = 0
  for (const raw of input.sourceKinds || []) {
    const kind = String(raw || '').trim()
    if (!kind) continue
    if (!excluded.has(kind)) independent += 1
    if (kind === 'failure_derived_curriculum') failureDerived += 1
    else nonFailure += 1
  }
  // Mirrors public.authorize_next_cos_university_mass_distillation_campaign():
  // 1) at least half the batch must be independent source material;
  // 2) remediation-heavy batches retain at least five non-failure items.
  return independent >= Math.ceil(sourceCount * 0.5)
    && (failureDerived < 20 || nonFailure >= 5)
}
