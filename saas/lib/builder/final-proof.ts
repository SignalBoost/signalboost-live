import type { BuilderAcceptanceLedger } from './acceptance-ledger.ts'
import { isolatedPreviewProbe } from './isolated-publication.ts'

export type BuilderFinalProof = Readonly<{
  passed: boolean
  failureCode: string | null
  criteria: Readonly<Record<string, boolean>>
}>

/** Compute final job success from host-owned receipts only; do not trust generated prose. */
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
  const wantsNewRepository = /\bcreate\s+(?:a\s+)?new\s+private\s+(?:GitHub\s+)?repository\b/i.test(input.objective)
  const wantsEndpoint = /\bGET\s+\//i.test(input.objective)
  const requiresBudget = /\b(?:inference|AI)\s*(?:spending|budget|cost)\b/i.test(input.objective) &&
    /\$\s*0\.50\b/.test(input.objective)
  const requiresDeadline = /\b10\s*minutes?\b/i.test(input.objective)
  const p = input.publication

  let endpointVerified = !wantsEndpoint
  if (wantsEndpoint && p?.status === 'verified' && p.httpStatus === 200 &&
      typeof p.endpointUrl === 'string' && typeof p.previewUrl === 'string') {
    try {
      const probe = isolatedPreviewProbe(input.objective)
      const endpoint = new URL(p.endpointUrl)
      const preview = new URL(p.previewUrl)
      endpointVerified = endpoint.protocol === 'https:' &&
        endpoint.origin === preview.origin && preview.hostname.endsWith('.vercel.app') &&
        endpoint.pathname + endpoint.search === probe.path &&
        (probe.expected === null || JSON.stringify(p.responseBody) === JSON.stringify(probe.expected))
    } catch { endpointVerified = false }
  }

  const criteria: Record<string, boolean> = {
    workspace: input.workspaceVerified,
    hostTests: input.acceptance.passed,
    publication: !input.requiresPublication || Boolean(
      !input.publicationError && p && typeof p.repository === 'string' &&
      /^https:\/\/github\.com\//.test(String(p.pullRequestUrl || '')) &&
      typeof p.commitSha === 'string' && /^[a-f0-9]{40}$/i.test(p.commitSha) &&
      typeof p.mergeCommitSha === 'string' && /^[a-f0-9]{40}$/i.test(p.mergeCommitSha) &&
      p.status === 'verified' &&
      typeof p.deploymentId === 'string' && p.deploymentId.length > 0 &&
      typeof p.previewUrl === 'string' && /^https:\/\/[^/]+\.vercel\.app\/?$/.test(p.previewUrl),
    ),
    newPrivateRepository: !wantsNewRepository || Boolean(p?.repositoryCreated === true && p?.repositoryPrivate === true),
    endpoint: endpointVerified,
    budget: !requiresBudget || Boolean(input.budget && input.budget.maxInferenceUsd <= 0.5 &&
      input.budget.accountedInferenceUsd + input.budget.pendingReservationUsd <= input.budget.maxInferenceUsd &&
      input.budget.priceCeilingBreached !== true),
    deadline: !requiresDeadline || Boolean(input.budget && input.budget.elapsedMs <= 600_000),
  }
  const failed = Object.entries(criteria).find(([, ok]) => !ok)?.[0] ?? null
  return { passed: failed === null, failureCode: failed ? `builder_final_${failed}_unverified` : null, criteria }
}
