import {
  createPortableConnectorRuntime,
  type PortableApprovalEvidence,
  type PortableConnectorAuditPort,
} from '../provider-hub-core/connector-runtime.ts'
import {
  createInMemoryMcpConnectionRegistry,
  createMcpConnectionRegistryResolver,
  type McpRegistryTransportFactory,
} from './mcp-connection-registry.ts'
import type { McpOutboundTransportInput } from './mcp-outbound-client.ts'
import {
  createMcpStreamableHttpTransportFactory,
  type McpStreamableHttpProfile,
} from './mcp-streamable-http-transport.ts'
import {
  CONTEXT7_MCP_PROFILE,
  GITHUB_MCP_PROFILE,
  SUPABASE_MCP_PROFILE,
  UNIVERSAL_MCP_PROFILES,
  createUniversalMcpRegistryEntries,
  universalMcpToolNames,
  type UniversalMcpProfileId,
  type UniversalMcpServerProfile,
} from './universal-mcp-profiles.ts'
import { createDurableMcpGatewayAuditPort } from './mcp-gateway-audit.ts'

export const UNIVERSAL_MCP_GATEWAY_VERSION = 'universal-mcp-gateway-v1' as const

type Environment = Readonly<Record<string, string | undefined>>

export interface UniversalMcpProviderReadiness {
  providerId: UniversalMcpProfileId
  displayName: string
  configured: boolean
  reason: 'ready' | 'missing_credential' | 'missing_project_ref'
  authentication: 'bearer' | 'anonymous'
  target: string
}

export interface UniversalMcpGatewayOptions {
  tenantId: string
  environmentId: string
  portableId: string
  actor?: { userId?: string; roles?: readonly string[] }
  env?: Environment
  fetcher?: typeof fetch
  audit?: PortableConnectorAuditPort
  allowedGitHubRepos?: readonly string[]
}

function required(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`Universal MCP ${name} is required`)
  return normalized
}

function plain(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function supabaseProjectRef(env: Environment): string | null {
  const explicit = String(env.SUPABASE_MCP_PROJECT_REF || '').trim()
  if (explicit) return /^[a-z0-9]+$/i.test(explicit) ? explicit : null
  const rawUrl = String(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '').trim()
  if (!rawUrl) return null
  try {
    const hostname = new URL(rawUrl).hostname
    const match = hostname.match(/^([a-z0-9]+)\.supabase\.co$/i)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

function githubToken(env: Environment): string {
  return String(env.GITHUB_MCP_TOKEN || env.GITHUB_TOKEN || env.GITHUB_WRITE_TOKEN || '').trim()
}

function githubRepos(env: Environment, override?: readonly string[]): readonly string[] {
  const values = override?.length
    ? override
    : String(env.MCP_GITHUB_ALLOWED_REPOS || 'SignalBoost/signalboost-live').split(',')
  const normalized = [...new Set(values.map(value => value.trim()).filter(value => /^[^/\s]+\/[^/\s]+$/.test(value)))]
  if (!normalized.length) throw new Error('universal_mcp_github_allowed_repo_required')
  return Object.freeze(normalized)
}

function profileFor(id: UniversalMcpProfileId): UniversalMcpServerProfile {
  const profile = UNIVERSAL_MCP_PROFILES.find(item => item.profileId === id)
  if (!profile) throw new Error(`universal_mcp_unknown_profile:${id}`)
  return profile
}

function readinessFor(env: Environment, allowedRepos: readonly string[]): readonly UniversalMcpProviderReadiness[] {
  const gitToken = githubToken(env)
  const sbToken = String(env.SUPABASE_ACCESS_TOKEN || '').trim()
  const sbRef = supabaseProjectRef(env)
  const context7Token = String(env.CONTEXT7_API_KEY || '').trim()
  return Object.freeze([
    Object.freeze({
      providerId: 'github-mcp' as const,
      displayName: GITHUB_MCP_PROFILE.displayName,
      configured: Boolean(gitToken),
      reason: gitToken ? 'ready' as const : 'missing_credential' as const,
      authentication: 'bearer' as const,
      target: allowedRepos.join(','),
    }),
    Object.freeze({
      providerId: 'supabase-mcp' as const,
      displayName: SUPABASE_MCP_PROFILE.displayName,
      configured: Boolean(sbToken && sbRef),
      reason: !sbToken ? 'missing_credential' as const : !sbRef ? 'missing_project_ref' as const : 'ready' as const,
      authentication: 'bearer' as const,
      target: sbRef ?? 'unresolved',
    }),
    Object.freeze({
      providerId: 'context7-mcp' as const,
      displayName: CONTEXT7_MCP_PROFILE.displayName,
      configured: true,
      reason: 'ready' as const,
      authentication: context7Token ? 'bearer' as const : 'anonymous' as const,
      target: 'public-documentation',
    }),
  ])
}

function httpProfiles(env: Environment, ready: readonly UniversalMcpProviderReadiness[]): readonly McpStreamableHttpProfile[] {
  const profiles: McpStreamableHttpProfile[] = []
  const gitToken = githubToken(env)
  const gitReady = ready.find(item => item.providerId === 'github-mcp')?.configured === true
  if (gitReady) {
    profiles.push(Object.freeze({
      serverId: GITHUB_MCP_PROFILE.serverId,
      transportRef: GITHUB_MCP_PROFILE.transportRef,
      endpoint: 'https://api.githubcopilot.com/mcp/',
      protocolVersion: GITHUB_MCP_PROFILE.protocolVersion,
      authorization: () => `Bearer ${gitToken}`,
      headers: Object.freeze({
        'X-MCP-Tools': universalMcpToolNames(GITHUB_MCP_PROFILE).join(','),
        'X-MCP-Lockdown': 'true',
      }),
    }))
  }

  const sbToken = String(env.SUPABASE_ACCESS_TOKEN || '').trim()
  const sbRef = supabaseProjectRef(env)
  const sbReady = ready.find(item => item.providerId === 'supabase-mcp')?.configured === true
  if (sbReady && sbRef) {
    const endpoint = new URL('https://mcp.supabase.com/mcp')
    endpoint.searchParams.set('project_ref', sbRef)
    endpoint.searchParams.set('features', 'docs,database,debugging,development,functions')
    profiles.push(Object.freeze({
      serverId: SUPABASE_MCP_PROFILE.serverId,
      transportRef: SUPABASE_MCP_PROFILE.transportRef,
      endpoint: endpoint.toString(),
      protocolVersion: SUPABASE_MCP_PROFILE.protocolVersion,
      authorization: () => `Bearer ${sbToken}`,
    }))
  }

  const ctxToken = String(env.CONTEXT7_API_KEY || '').trim()
  profiles.push(Object.freeze({
    serverId: CONTEXT7_MCP_PROFILE.serverId,
    transportRef: CONTEXT7_MCP_PROFILE.transportRef,
    endpoint: 'https://mcp.context7.com/mcp',
    protocolVersion: CONTEXT7_MCP_PROFILE.protocolVersion,
    ...(ctxToken ? { authorization: () => `Bearer ${ctxToken}` } : {}),
  }))

  return Object.freeze(profiles)
}

function githubTarget(args: Record<string, unknown>): string | null {
  const owner = typeof args.owner === 'string' ? args.owner.trim() : ''
  const repo = typeof args.repo === 'string' ? args.repo.trim() : ''
  return owner && repo ? `${owner}/${repo}` : null
}

function guardGithubArguments(
  toolName: string,
  args: Record<string, unknown>,
  allowedRepos: readonly string[],
): Readonly<Record<string, unknown>> {
  if (toolName === 'get_me') return Object.freeze({ ...args })
  const allowed = new Map(allowedRepos.map(repo => [repo.toLowerCase(), repo]))
  const single = allowedRepos.length === 1 ? allowedRepos[0] : null

  if (toolName === 'search_code') {
    const query = required(args.query, 'GitHub search query')
    const repoQualifiers = [...query.matchAll(/\brepo:([^\s]+)/gi)].map(match => match[1])
    if (repoQualifiers.some(repo => !allowed.has(repo.toLowerCase()))) {
      throw new Error('universal_mcp_github_repository_rejected')
    }
    if (/\b(?:org|user):[^\s]+/i.test(query)) throw new Error('universal_mcp_github_search_scope_rejected')
    if (!repoQualifiers.length) {
      if (!single) throw new Error('universal_mcp_github_repository_required')
      return Object.freeze({ ...args, query: `${query} repo:${single}` })
    }
    return Object.freeze({ ...args })
  }

  const mutable = { ...args }
  let target = githubTarget(mutable)
  if (!target && single && ['search_issues', 'search_pull_requests'].includes(toolName)) {
    const [owner, repo] = single.split('/')
    mutable.owner = owner
    mutable.repo = repo
    target = single
  }
  if (!target || !allowed.has(target.toLowerCase())) throw new Error('universal_mcp_github_repository_rejected')
  return Object.freeze(mutable)
}

function guardedFactory(
  base: McpRegistryTransportFactory,
  allowedRepos: readonly string[],
): McpRegistryTransportFactory {
  return Object.freeze({
    create(input) {
      const profile = profileFor(input.serverId as UniversalMcpProfileId)
      const allowedTools = new Set(universalMcpToolNames(profile))
      const delegate = base.create(input)
      return Object.freeze({
        async send(call: McpOutboundTransportInput) {
          if (call.request.method !== 'tools/call') return delegate.send(call)
          const params = plain(call.request.params) ? call.request.params : {}
          const name = required(params.name, 'tool name')
          if (!allowedTools.has(name)) throw new Error(`universal_mcp_tool_rejected:${name}`)
          const args = plain(params.arguments) ? params.arguments : {}
          const guardedArgs = profile.profileId === 'github-mcp'
            ? guardGithubArguments(name, { ...args }, allowedRepos)
            : Object.freeze({ ...args })
          return delegate.send({
            ...call,
            request: Object.freeze({
              ...call.request,
              params: Object.freeze({ ...params, name, arguments: guardedArgs }),
            }),
          })
        },
        async notify(call: McpOutboundTransportInput) { await delegate.notify?.(call) },
        async close() { await delegate.close?.() },
      })
    },
  })
}

export function createUniversalMcpGateway(options: UniversalMcpGatewayOptions) {
  const tenantId = required(options.tenantId, 'tenantId')
  const environmentId = required(options.environmentId, 'environmentId')
  const portableId = required(options.portableId, 'portableId')
  const env: Environment = options.env ?? process.env
  const allowedRepos = githubRepos(env, options.allowedGitHubRepos)
  const readiness = readinessFor(env, allowedRepos)
  const enabledProfiles = readiness.filter(item => item.configured).map(item => item.providerId)
  const registry = createInMemoryMcpConnectionRegistry(createUniversalMcpRegistryEntries({
    tenantId,
    environmentId,
    portableId,
    enabledProfiles,
  }))
  const http = createMcpStreamableHttpTransportFactory({
    profiles: httpProfiles(env, readiness),
    fetcher: options.fetcher,
  })
  const resolver = createMcpConnectionRegistryResolver({
    registry,
    transportFactory: guardedFactory(http, allowedRepos),
    timeoutMs: 30_000,
    maxTools: 128,
  })
  const audit = options.audit ?? createDurableMcpGatewayAuditPort()

  async function resolved(serverId: UniversalMcpProfileId) {
    const provider = readiness.find(item => item.providerId === serverId)
    if (!provider?.configured) return null
    return resolver.resolve({ tenantId, environmentId, portableId, serverId, actor: options.actor })
  }

  async function discover(serverId: UniversalMcpProfileId) {
    const resolution = await resolved(serverId)
    if (!resolution) return Object.freeze([])
    try {
      return await resolution.adapter.discovery.discover({ tenantId, environmentId, portableId })
    } finally {
      await resolution.close()
    }
  }

  async function invoke(input: {
    serverId: UniversalMcpProfileId
    capabilityId: string
    args: Readonly<Record<string, unknown>>
    approval?: PortableApprovalEvidence
    traceId?: string
    timeoutMs?: number
  }) {
    const resolution = await resolved(input.serverId)
    if (!resolution) {
      return Object.freeze({
        ok: false,
        providerId: input.serverId,
        capabilityId: input.capabilityId,
        mode: 'mcp_provider_not_configured',
        error: input.serverId,
      })
    }
    const profile = profileFor(input.serverId)
    const policy = profile.tools.find(item => `mcp.${profile.profileId}.${item.capabilityName}` === input.capabilityId)
    if (!policy) {
      await resolution.close()
      return Object.freeze({
        ok: false,
        providerId: input.serverId,
        capabilityId: input.capabilityId,
        mode: 'capability_unavailable',
        error: input.capabilityId,
      })
    }
    const runtime = createPortableConnectorRuntime({
      discovery: resolution.adapter.discovery,
      execution: resolution.adapter.execution,
      audit,
      requireAuditForConsequential: true,
      defaultTimeoutMs: 30_000,
      maxTimeoutMs: 120_000,
    })
    try {
      return await runtime.invoke({
        manifest: {
          portableId,
          manifestVersion: UNIVERSAL_MCP_GATEWAY_VERSION,
          requirements: [{
            capabilityId: input.capabilityId,
            required: true,
            allowedRisk: policy.risk,
          }],
        },
        invocation: {
          tenantId,
          environmentId,
          portableId,
          capabilityId: input.capabilityId,
          args: input.args,
          approval: input.approval,
          traceId: input.traceId,
          timeoutMs: input.timeoutMs,
        },
      })
    } finally {
      await resolution.close()
    }
  }

  return Object.freeze({
    schemaVersion: UNIVERSAL_MCP_GATEWAY_VERSION,
    tenantId,
    environmentId,
    portableId,
    readiness,
    discover,
    invoke,
  })
}
