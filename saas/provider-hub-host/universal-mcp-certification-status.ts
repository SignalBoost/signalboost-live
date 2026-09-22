export const UNIVERSAL_MCP_CERTIFICATION_STATUS_VERSION = 'universal-mcp-certification-status-v1' as const

export type UniversalMcpCertificationState = 'certified' | 'blocked_external'

export interface UniversalMcpCertificationEntry {
  providerId: 'github-mcp' | 'supabase-mcp' | 'context7-mcp' | 'figma-mcp' | 'vercel-mcp'
  state: UniversalMcpCertificationState
  observedAt: string
  evidence: string
  blocker?: 'provider_client_approval_required'
}

export interface UniversalMcpCertificationStatus {
  schemaVersion: typeof UNIVERSAL_MCP_CERTIFICATION_STATUS_VERSION
  requiredProviders: 5
  certifiedProviders: 4
  productionReady: false
  blocker: 'figma-mcp'
  providers: readonly UniversalMcpCertificationEntry[]
}

export const UNIVERSAL_MCP_CERTIFICATION_STATUS: UniversalMcpCertificationStatus = Object.freeze({
  schemaVersion: UNIVERSAL_MCP_CERTIFICATION_STATUS_VERSION,
  requiredProviders: 5,
  certifiedProviders: 4,
  productionReady: false,
  blocker: 'figma-mcp',
  providers: Object.freeze([
    Object.freeze({
      providerId: 'github-mcp',
      state: 'certified',
      observedAt: '2026-09-22T16:31:49.000Z',
      evidence: 'vercel-preview:7737a2160fbf67f00ba21483945ba7679f20c1cd',
    }),
    Object.freeze({
      providerId: 'context7-mcp',
      state: 'certified',
      observedAt: '2026-09-22T16:31:49.000Z',
      evidence: 'vercel-preview:7737a2160fbf67f00ba21483945ba7679f20c1cd',
    }),
    Object.freeze({
      providerId: 'supabase-mcp',
      state: 'certified',
      observedAt: '2026-09-22T17:11:18.000Z',
      evidence: 'vercel-preview:45d857c4da787dd158d8664d0ad7ca2a68dd152d',
    }),
    Object.freeze({
      providerId: 'vercel-mcp',
      state: 'certified',
      observedAt: '2026-09-22T17:12:42.000Z',
      evidence: 'vercel-preview:bf9f69aea1ad97a9d02034f508e7ab7e1aa779cb',
    }),
    Object.freeze({
      providerId: 'figma-mcp',
      state: 'blocked_external',
      observedAt: '2026-09-22T17:12:42.000Z',
      evidence: 'figma-custom-client-registration-submitted',
      blocker: 'provider_client_approval_required',
    }),
  ]),
})
