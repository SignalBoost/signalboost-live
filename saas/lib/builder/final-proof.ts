import type { BuilderAcceptanceLedger } from './acceptance-ledger.ts'

export type BuilderFinalProof = Readonly<{
  passed: boolean
  failureCode: string | null
  criteria: Readonly<Record<string, boolean>>
}>

/** Host-owned final verdict. A model summary or READY deployment cannot override missing evidence. */
export function builderFinalProof(input: Readonly<{
  objective: string
  workspaceVerified: boolean
  acceptance: BuilderAcceptanceLedger
  publication: Record<string, unknown> | null
  publicationError: string | null
  budget: null | {
    maxInferenceUsd: number
    accountedInferenceUsd: number
    pendingReservationUsd: number
    elapsedMs: number
    priceCeilingBreached?: boolean
  }
  requiresPublication: boolean
}>): BuilderFinalProof {
  const requestedNewRepo = /\bcreate\s+(?:a\s+)?new\s+private\s+(?:GitHub\s+)?repository\b/i.test(input.objective)
  const requestedEndpoint = /\bGET\s+\/[^\s`<>"']+/i.test(input.objective)
  const p = input.publication
  const criteria: Record<string, boolean> = {
    workspace: input.workspaceVerified,
    hostTests: input.acceptance.passed,
    publication: !input.requiresPublication || Boolean(
      !input.publicationError && p && typeof p.repository === 'string' &&
      /^https:\/\/github\.com\//.test(String(p.pullRequestUrl || '')) &&
      typeof p.commitSha === 'string' && /^[a-f0-9]{40}$/i.test(p.commitSha) &&
      typeof p.mergeCommitSha === 'string' && /^[a-f0-9]{40}$/i.test(p.mergeCommitSha),
    ),
    newPrivateRepository: !requestedNewRepo || Boolean(p && p.repositoryCreated === true && p.repositoryPrivate === true),
    endpoint: !requestedEndpoint || Boolean(p && p.status === 'verified' &&
      p.httpStatus === 200 && typeof p.endpointUrl === 'string' && p.endpointUrl.includes('/')),
    budget: !input.budget || (input.budget.accountedInferenceUsd + input.budget.pendingReservationUsd <= input.budget.maxInferenceUsd &&
      input.budget.priceCeilingBreached !== true),
    deadline: !input.budget || input.budget.elapsedMs <= 600_000 || !/\b10\s*minutes?\b/i.test(input.objective),
  }
  const failureCode = Object.entries(criteria).find(([, ok]) => !ok)?.[0] ?? null
  return { passed: failureCode === null, failureCode: failureCode ? 'builder_final_' + failureCode + '_unverified' : null, criteria }
}
