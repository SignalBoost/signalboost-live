import type { UniversalMcpProfileId } from './universal-mcp-profiles.ts'

export const UNIVERSAL_MCP_CERTIFICATION_STATUS_VERSION = 'universal-mcp-certification-status-v1' as const

export type UniversalMcpCertificationState = 'certified' | 'blocked_external'

export interface UniversalMcpProviderCertificationStatus {
  readonly providerId: UniversalMcpProfileId
  readonly state: UniversalMcpCertificationState
  readonly evidence: 'vercel_preview_live_acceptance' | 'provider_client_approval_pending'
  readonly observedAt: string
  readonly detail: string
}

export const UNIVERSAL_MCP_PROVIDER_CERTIFICATIONS: readonly UniversalMcpProviderCertificationStatus[] = Object.freeze([
  Object.freeze({
    providerId: 'github-mcp',
    state: 'certified',
    evidence: 'vercel_preview_live_acceptance',
    observedAt: '2026-09-22T16:31:48Z',
    detail: 'Live private-repository read, governed read projection, cross-repository rejection, and Context7-independent GitHub MCP acceptance passed in Vercel Preview.',
  }),
  Object.freeze({
    providerId: 'context7-mcp',
    state: 'certified',
    evidence: 'vercel_preview_live_acceptance',
    observedAt: '2026-09-22T16:31:48Z',
    detail: 'Exact governed projection and real Next.js documentation lookup passed in Vercel Preview.',
  }),
  Object.freeze({
    providerId: 'supabase-mcp',
    state: 'certified',
    evidence: 'vercel_preview_live_acceptance',
    observedAt: '2026-09-22T17:11:18Z',
    detail: 'Exact governed projection and real public-schema table listing passed in an isolated Vercel Preview.',
  }),
  Object.freeze({
    providerId: 'vercel-mcp',
    state: 'blocked_external',
    evidence: 'provider_client_approval_pending',
    observedAt: '2026-09-25',
    detail: 'A prior isolated Preview proved the governed Vercel MCP project-read path, but durable Production OAuth is not accepted until Vercel allowlists the iTMounts client/redirect URI and a host-owned refreshable OAuth connection is available.',
  }),
  Object.freeze({
    providerId: 'figma-mcp',
    state: 'blocked_external',
    evidence: 'provider_client_approval_pending',
    observedAt: '2026-09-22',
    detail: 'iTMounts custom MCP client registration was submitted to Figma; runtime remains fail-closed pending provider client approval and host-owned OAuth connection.',
  }),
])

export function universalMcpCertificationSummary() {
  const providers = UNIVERSAL_MCP_PROVIDER_CERTIFICATIONS
  const certified = providers.filter(item => item.state === 'certified')
  const blockedExternal = providers.filter(item => item.state === 'blocked_external')
  return Object.freeze({
    schemaVersion: UNIVERSAL_MCP_CERTIFICATION_STATUS_VERSION,
    totalProviders: providers.length,
    certifiedProviders: certified.length,
    blockedExternalProviders: blockedExternal.length,
    fullSuiteCertified: certified.length === providers.length,
    providers,
  })
}
