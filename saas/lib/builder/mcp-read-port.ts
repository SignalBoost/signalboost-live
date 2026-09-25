import type { BuilderMcpReadCapability, BuilderMcpReadPort } from './contracts.ts'
import { createUniversalMcpGateway, type UniversalMcpFigmaAuthorization, type UniversalMcpGatewayOptions } from '../../provider-hub-host/universal-mcp-gateway.ts'
import {
  UNIVERSAL_MCP_PROFILES,
  type UniversalMcpProfileId,
} from '../../provider-hub-host/universal-mcp-profiles.ts'
import { inspectUntrustedAiContent } from '../security/aiSecurityGateway.ts'
import { recordAiSecuritySupervisorObservation } from '../security/aiSecuritySupervisorTelemetry.ts'

type Environment = Readonly<Record<string, string | undefined>>

const BUILDER_MCP_EXCLUDED_READS = new Set([
  // Binary/large visual payloads are not useful inside Builder's text control loop.
  'mcp.figma-mcp.screenshot.read',
  // A publishable key is intentionally public, but Builder has no need to retrieve credentials.
  'mcp.supabase-mcp.publishable_keys.read',
])

export const BUILDER_MCP_READ_CATALOG: readonly BuilderMcpReadCapability[] = Object.freeze(
  UNIVERSAL_MCP_PROFILES.flatMap(profile =>
    profile.tools
      .filter(tool => tool.risk === 'read')
      .map(tool => Object.freeze({
        providerId: profile.profileId,
        capabilityId: `mcp.${profile.profileId}.${tool.capabilityName}`,
      }))
      .filter(item => !BUILDER_MCP_EXCLUDED_READS.has(item.capabilityId)),
  ),
)

function allowedCatalog(ownerAuthorized: boolean): readonly BuilderMcpReadCapability[] {
  // Context7 is public documentation. The other configured providers currently use host-owned
  // iTMounts credentials and must never be projected into an ordinary customer Builder session.
  return Object.freeze(BUILDER_MCP_READ_CATALOG.filter(item =>
    item.providerId === 'context7-mcp' || ownerAuthorized,
  ))
}

function exactCapability(
  catalog: readonly BuilderMcpReadCapability[],
  providerId: string,
  capabilityId: string,
): BuilderMcpReadCapability | null {
  return catalog.find(item => item.providerId === providerId && item.capabilityId === capabilityId) ?? null
}

export function createBuilderMcpReadPort(input: {
  tenantId: string
  userId: string
  environmentId: string
  ownerAuthorized: boolean
  env?: Environment
  fetcher?: typeof fetch
  figmaAuthorization?: UniversalMcpFigmaAuthorization
  securityObservationRecorder?: typeof recordAiSecuritySupervisorObservation
  mcpAudit?: UniversalMcpGatewayOptions['audit']
}): BuilderMcpReadPort {
  const gateway = createUniversalMcpGateway({
    tenantId: input.tenantId,
    environmentId: input.environmentId,
    portableId: 'builder',
    actor: {
      userId: input.userId,
      roles: input.ownerAuthorized ? ['owner'] : [],
    },
    env: input.env,
    fetcher: input.fetcher,
    figmaAuthorization: input.figmaAuthorization,
    audit: input.mcpAudit,
  })
  const catalog = allowedCatalog(input.ownerAuthorized)
  const securityObservationRecorder = input.securityObservationRecorder ?? recordAiSecuritySupervisorObservation
  const configured = new Set(
    gateway.readiness.filter(item => item.configured).map(item => item.providerId),
  )

  return Object.freeze({
    async capabilities() {
      return Object.freeze(catalog.filter(item => configured.has(item.providerId as UniversalMcpProfileId)))
    },

    async invoke(request) {
      const capability = exactCapability(catalog, request.providerId, request.capabilityId)
      if (!capability) {
        return Object.freeze({
          ok: false,
          mode: 'builder_mcp_capability_rejected',
          error: request.capabilityId,
        })
      }
      if (!configured.has(capability.providerId as UniversalMcpProfileId)) {
        return Object.freeze({
          ok: false,
          mode: 'mcp_provider_not_configured',
          error: capability.providerId,
        })
      }

      const result = await gateway.invoke({
        serverId: capability.providerId as UniversalMcpProfileId,
        capabilityId: capability.capabilityId,
        args: request.args,
        traceId: request.traceId,
        timeoutMs: 30_000,
      })

      const inspected = inspectUntrustedAiContent({
        source: 'mcp_tool_output',
        data: 'data' in result ? result.data : undefined,
      })
      if (inspected.findings.length) {
        await securityObservationRecorder({
          source: 'mcp_tool_output',
          surface: 'builder_mcp',
          disposition: inspected.disposition,
          findings: inspected.findings,
          redactedCount: inspected.redactedCount,
          traceId: request.traceId || `${request.providerId}:${request.capabilityId}`,
        })
      }
      if (inspected.disposition === 'quarantined') {
        return Object.freeze({
          ok: false,
          data: inspected.modelData,
          error: 'mcp_output_quarantined_by_ai_security_gateway',
          mode: 'ai_security_quarantined',
        })
      }
      return Object.freeze({
        ok: result.ok,
        data: inspected.modelData,
        error: result.error,
        mode: inspected.disposition === 'sanitized' ? 'ai_security_sanitized' : result.mode,
      })
    },
  })
}
