import type { PortableCapabilityRisk } from '../provider-hub-core/capability-runtime.ts'
import type {
  McpPortableServerAssignment,
  McpRegisteredServer,
  McpRegisteredToolMapping,
} from './mcp-connection-registry.ts'

export const UNIVERSAL_MCP_PROFILE_VERSION = 'universal-mcp-profile-v1' as const
export const UNIVERSAL_MCP_PROTOCOL_VERSION = '2025-11-25' as const

export type UniversalMcpProfileId = 'github-mcp' | 'supabase-mcp' | 'context7-mcp' | 'figma-mcp'

export interface UniversalMcpToolPolicy {
  readonly remoteToolName: string
  readonly capabilityName: string
  readonly risk: PortableCapabilityRisk
  readonly requiresApproval: boolean
  readonly scopes: readonly string[]
}

export interface UniversalMcpServerProfile {
  readonly profileId: UniversalMcpProfileId
  readonly serverId: UniversalMcpProfileId
  readonly displayName: string
  readonly transport: 'streamable-http'
  readonly transportRef: string
  readonly protocolVersion: typeof UNIVERSAL_MCP_PROTOCOL_VERSION
  readonly tools: readonly UniversalMcpToolPolicy[]
}

function tool(
  remoteToolName: string,
  capabilityName: string,
  risk: PortableCapabilityRisk,
  requiresApproval: boolean,
  scopes: readonly string[],
): UniversalMcpToolPolicy {
  return Object.freeze({
    remoteToolName,
    capabilityName,
    risk,
    requiresApproval,
    scopes: Object.freeze([...scopes]),
  })
}

const read = (remote: string, capability: string, scope: string) => tool(remote, capability, 'read', false, [scope])
const write = (remote: string, capability: string, scope: string) => tool(remote, capability, 'write', true, [scope])
const consequential = (remote: string, capability: string, scope: string) => tool(remote, capability, 'consequential', true, [scope])

export const GITHUB_MCP_PROFILE: UniversalMcpServerProfile = Object.freeze({
  profileId: 'github-mcp',
  serverId: 'github-mcp',
  displayName: 'GitHub MCP',
  transport: 'streamable-http',
  transportRef: 'host:mcp:github',
  protocolVersion: UNIVERSAL_MCP_PROTOCOL_VERSION,
  tools: Object.freeze([
    read('get_me', 'identity.read', 'repository.read'),
    read('get_file_contents', 'contents.read', 'repository.read'),
    read('search_code', 'code.search', 'repository.read'),
    read('list_commits', 'commits.list', 'repository.read'),
    read('get_commit', 'commit.read', 'repository.read'),
    read('list_branches', 'branches.list', 'repository.read'),
    read('list_pull_requests', 'pull_requests.list', 'repository.read'),
    read('pull_request_read', 'pull_request.read', 'repository.read'),
    read('search_pull_requests', 'pull_requests.search', 'repository.read'),
    read('issue_read', 'issue.read', 'repository.read'),
    read('search_issues', 'issues.search', 'repository.read'),
    read('actions_list', 'actions.list', 'repository.actions.read'),
    read('actions_get', 'actions.read', 'repository.actions.read'),
    write('create_branch', 'branch.create', 'repository.write'),
    write('create_or_update_file', 'contents.write', 'repository.write'),
    write('push_files', 'contents.push', 'repository.write'),
    write('create_pull_request', 'pull_request.create', 'repository.write'),
    write('update_pull_request', 'pull_request.update', 'repository.write'),
    write('issue_write', 'issue.write', 'repository.write'),
    write('add_issue_comment', 'issue.comment', 'repository.write'),
    consequential('merge_pull_request', 'pull_request.merge', 'repository.merge'),
    consequential('actions_run_trigger', 'actions.trigger', 'repository.actions.execute'),
  ]),
})

export const SUPABASE_MCP_PROFILE: UniversalMcpServerProfile = Object.freeze({
  profileId: 'supabase-mcp',
  serverId: 'supabase-mcp',
  displayName: 'Supabase MCP',
  transport: 'streamable-http',
  transportRef: 'host:mcp:supabase',
  protocolVersion: UNIVERSAL_MCP_PROTOCOL_VERSION,
  tools: Object.freeze([
    read('search_docs', 'docs.search', 'database.docs.read'),
    read('list_tables', 'tables.list', 'database.schema.read'),
    read('list_extensions', 'extensions.list', 'database.schema.read'),
    read('list_migrations', 'migrations.list', 'database.schema.read'),
    read('query_logs', 'logs.query', 'database.logs.read'),
    read('get_advisors', 'advisors.read', 'database.advisors.read'),
    read('get_project_url', 'project_url.read', 'database.project.read'),
    read('get_publishable_keys', 'publishable_keys.read', 'database.project.read'),
    read('generate_typescript_types', 'types.generate', 'database.schema.read'),
    read('list_edge_functions', 'edge_functions.list', 'database.functions.read'),
    read('get_edge_function', 'edge_function.read', 'database.functions.read'),
    consequential('execute_sql', 'sql.execute', 'database.sql.execute'),
    consequential('apply_migration', 'migration.apply', 'database.schema.write'),
    consequential('deploy_edge_function', 'edge_function.deploy', 'database.functions.write'),
  ]),
})

export const CONTEXT7_MCP_PROFILE: UniversalMcpServerProfile = Object.freeze({
  profileId: 'context7-mcp',
  serverId: 'context7-mcp',
  displayName: 'Context7 MCP',
  transport: 'streamable-http',
  transportRef: 'host:mcp:context7',
  protocolVersion: UNIVERSAL_MCP_PROTOCOL_VERSION,
  tools: Object.freeze([
    read('resolve-library-id', 'library.resolve', 'documentation.read'),
    read('query-docs', 'docs.query', 'documentation.read'),
  ]),
})


export const FIGMA_MCP_PROFILE: UniversalMcpServerProfile = Object.freeze({
  profileId: 'figma-mcp',
  serverId: 'figma-mcp',
  displayName: 'Figma MCP',
  transport: 'streamable-http',
  transportRef: 'host:mcp:figma',
  protocolVersion: UNIVERSAL_MCP_PROTOCOL_VERSION,
  tools: Object.freeze([
    read('whoami', 'identity.read', 'design.account.read'),
    read('get_design_context', 'design_context.read', 'design.file.read'),
    read('get_metadata', 'metadata.read', 'design.file.read'),
    read('get_screenshot', 'screenshot.read', 'design.file.read'),
    read('get_variable_defs', 'variables.read', 'design.file.read'),
    read('get_code_connect_map', 'code_connect.read', 'design.code_connect.read'),
    read('get_libraries', 'libraries.list', 'design.library.read'),
    read('search_design_system', 'design_system.search', 'design.library.read'),
    write('add_code_connect_map', 'code_connect.write', 'design.code_connect.write'),
    write('create_new_file', 'file.create', 'design.file.write'),
    write('generate_diagram', 'diagram.generate', 'design.file.write'),
    write('generate_figma_design', 'design.generate', 'design.file.write'),
    write('upload_assets', 'assets.upload', 'design.file.write'),
    consequential('use_figma', 'canvas.mutate', 'design.canvas.mutate'),
  ]),
})

export const UNIVERSAL_MCP_PROFILES: readonly UniversalMcpServerProfile[] = Object.freeze([
  GITHUB_MCP_PROFILE,
  SUPABASE_MCP_PROFILE,
  CONTEXT7_MCP_PROFILE,
  FIGMA_MCP_PROFILE,
])

export function universalMcpToolNames(profile: UniversalMcpServerProfile): readonly string[] {
  return Object.freeze(profile.tools.map(item => item.remoteToolName).sort())
}

function mappingsFor(profile: UniversalMcpServerProfile, connectionId: string): readonly McpRegisteredToolMapping[] {
  return Object.freeze(profile.tools.map(item => Object.freeze({
    remoteToolName: item.remoteToolName,
    capabilityId: `mcp.${profile.profileId}.${item.capabilityName}`,
    providerId: profile.serverId,
    connectionId,
    risk: item.risk,
    requiresApproval: item.requiresApproval,
    scopes: item.scopes,
    metadata: Object.freeze({
      universalMcpProfileVersion: UNIVERSAL_MCP_PROFILE_VERSION,
      universalMcpProfile: profile.profileId,
      authorizationPolicy: 'provider_hub_host_enforced',
    }),
  })))
}

export function createUniversalMcpRegistryEntries(input: {
  tenantId: string
  environmentId: string
  portableId: string
  enabledProfiles: readonly UniversalMcpProfileId[]
}): {
  readonly servers: readonly McpRegisteredServer[]
  readonly assignments: readonly McpPortableServerAssignment[]
} {
  const enabled = new Set(input.enabledProfiles)
  const selected = UNIVERSAL_MCP_PROFILES.filter(profile => enabled.has(profile.profileId))
  return Object.freeze({
    servers: Object.freeze(selected.map(profile => Object.freeze({
      serverId: profile.serverId,
      displayName: profile.displayName,
      transportRef: profile.transportRef,
      protocolVersion: profile.protocolVersion,
      enabled: true,
      metadata: Object.freeze({
        profileVersion: UNIVERSAL_MCP_PROFILE_VERSION,
        transport: profile.transport,
      }),
    }))),
    assignments: Object.freeze(selected.map(profile => Object.freeze({
      assignmentId: `${profile.serverId}:${input.tenantId}:${input.environmentId}:${input.portableId}`,
      serverId: profile.serverId,
      tenantId: input.tenantId,
      environmentId: input.environmentId,
      portableId: input.portableId,
      enabled: true,
      tools: mappingsFor(profile, `${profile.serverId}:${input.environmentId}`),
    }))),
  })
}
