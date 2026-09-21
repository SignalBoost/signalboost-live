import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

import type { PortableConnectorAuditEvent } from '../provider-hub-core/connector-runtime.ts'
import { createUniversalMcpGateway } from '../provider-hub-host/universal-mcp-gateway.ts'
import {
  CONTEXT7_MCP_PROFILE,
  FIGMA_MCP_PROFILE,
  GITHUB_MCP_PROFILE,
  SUPABASE_MCP_PROFILE,
  VERCEL_MCP_PROFILE,
} from '../provider-hub-host/universal-mcp-profiles.ts'

function rpc(id: unknown, result: unknown) {
  return { jsonrpc: '2.0', id, result }
}

function fakeMcpFetch(toolCalls: string[]): typeof fetch {
  return async (input, init = {}) => {
    const body = JSON.parse(String(init.body || '{}'))
    if (body.method === 'notifications/initialized') return new Response('', { status: 202 })
    if (body.method === 'initialize') {
      return Response.json(rpc(body.id, {
        protocolVersion: '2025-11-25',
        serverInfo: { name: new URL(String(input)).hostname, version: 'test' },
        capabilities: { tools: {} },
      }))
    }
    if (body.method === 'tools/list') {
      const host = new URL(String(input)).hostname
      const names = host === 'api.githubcopilot.com'
        ? GITHUB_MCP_PROFILE.tools.map(item => item.remoteToolName)
        : host === 'mcp.supabase.com'
          ? SUPABASE_MCP_PROFILE.tools.map(item => item.remoteToolName)
          : host === 'mcp.figma.com'
            ? FIGMA_MCP_PROFILE.tools.map(item => item.remoteToolName)
            : host === 'mcp.vercel.com'
              ? VERCEL_MCP_PROFILE.tools.map(item => item.remoteToolName)
              : CONTEXT7_MCP_PROFILE.tools.map(item => item.remoteToolName)
      return Response.json(rpc(body.id, {
        tools: names.map(name => ({ name, description: name, inputSchema: { type: 'object' } })),
      }))
    }
    if (body.method === 'tools/call') {
      toolCalls.push(body.params.name)
      return Response.json(rpc(body.id, {
        content: [{ type: 'text', text: 'ok' }],
        isError: false,
      }))
    }
    throw new Error(`unexpected MCP method: ${body.method}`)
  }
}

test('gateway readiness is honest: Context7 works anonymously while credentialed providers fail closed', () => {
  const gateway = createUniversalMcpGateway({
    tenantId: 'tenant-a',
    environmentId: 'test',
    portableId: 'builder',
    env: {},
    fetcher: fakeMcpFetch([]),
    audit: { async append() {} },
  })
  assert.deepEqual(
    gateway.readiness.map(item => [item.providerId, item.configured, item.reason]),
    [
      ['github-mcp', false, 'missing_credential'],
      ['supabase-mcp', false, 'missing_credential'],
      ['context7-mcp', true, 'ready'],
      ['figma-mcp', false, 'missing_credential'],
      ['vercel-mcp', false, 'missing_credential'],
    ],
  )
})

test('profiles classify mutations and consequential operations without trusting remote descriptions', () => {
  assert.equal(GITHUB_MCP_PROFILE.tools.find(item => item.remoteToolName === 'get_file_contents')?.risk, 'read')
  assert.equal(GITHUB_MCP_PROFILE.tools.find(item => item.remoteToolName === 'issue_write')?.requiresApproval, true)
  assert.equal(GITHUB_MCP_PROFILE.tools.find(item => item.remoteToolName === 'merge_pull_request')?.risk, 'consequential')
  assert.equal(SUPABASE_MCP_PROFILE.tools.find(item => item.remoteToolName === 'execute_sql')?.risk, 'consequential')
  assert.equal(SUPABASE_MCP_PROFILE.tools.find(item => item.remoteToolName === 'apply_migration')?.requiresApproval, true)
  assert.equal(CONTEXT7_MCP_PROFILE.tools.every(item => item.risk === 'read' && !item.requiresApproval), true)
  assert.equal(FIGMA_MCP_PROFILE.tools.find(item => item.remoteToolName === 'get_design_context')?.risk, 'read')
  assert.equal(FIGMA_MCP_PROFILE.tools.find(item => item.remoteToolName === 'create_new_file')?.requiresApproval, true)
  assert.equal(FIGMA_MCP_PROFILE.tools.find(item => item.remoteToolName === 'use_figma')?.risk, 'consequential')
  assert.equal(VERCEL_MCP_PROFILE.tools.every(item => item.risk === 'read' && !item.requiresApproval), true)
  assert.equal(VERCEL_MCP_PROFILE.tools.some(item => item.remoteToolName === 'buy_domain'), false)
  assert.equal(VERCEL_MCP_PROFILE.tools.some(item => item.remoteToolName === 'deploy_to_vercel'), false)
})

test('Context7 live shape is projected to exactly the two governed documentation capabilities', async () => {
  const gateway = createUniversalMcpGateway({
    tenantId: 'tenant-a',
    environmentId: 'test',
    portableId: 'builder',
    env: {},
    fetcher: fakeMcpFetch([]),
    audit: { async append() {} },
  })
  const visible = await gateway.discover('context7-mcp')
  assert.deepEqual(
    visible.map(item => item.capabilityId).sort(),
    ['mcp.context7-mcp.docs.query', 'mcp.context7-mcp.library.resolve'],
  )
})

test('GitHub writes require approval and repository scope is host-enforced', async () => {
  const calls: string[] = []
  const gateway = createUniversalMcpGateway({
    tenantId: 'tenant-a',
    environmentId: 'test',
    portableId: 'builder',
    env: { GITHUB_MCP_TOKEN: 'token' },
    allowedGitHubRepos: ['SignalBoost/signalboost-live'],
    fetcher: fakeMcpFetch(calls),
    audit: { async append() {} },
  })

  const blocked = await gateway.invoke({
    serverId: 'github-mcp',
    capabilityId: 'mcp.github-mcp.issue.write',
    args: { owner: 'SignalBoost', repo: 'signalboost-live', method: 'create', title: 'x' },
  })
  assert.equal(blocked.mode, 'approval_required')
  assert.equal(calls.length, 0)

  const offRepo = await gateway.invoke({
    serverId: 'github-mcp',
    capabilityId: 'mcp.github-mcp.contents.read',
    args: { owner: 'other', repo: 'repo', path: 'README.md' },
  })
  assert.equal(offRepo.ok, false)
  assert.match(offRepo.error || '', /universal_mcp_github_repository_rejected/)

  const approved = await gateway.invoke({
    serverId: 'github-mcp',
    capabilityId: 'mcp.github-mcp.issue.write',
    args: { owner: 'SignalBoost', repo: 'signalboost-live', method: 'create', title: 'x' },
    approval: { approvalId: 'owner-1', approvedBy: 'owner', approvedAt: '2026-09-21T18:00:00.000Z' },
  })
  assert.equal(approved.ok, true)
  assert.deepEqual(calls, ['issue_write'])
})

test('GitHub code search is forcibly repository-bounded and rejects cross-repo qualifiers', async () => {
  const calls: string[] = []
  const seenBodies: any[] = []
  const base = fakeMcpFetch(calls)
  const fetcher: typeof fetch = async (input, init = {}) => {
    const body = JSON.parse(String(init.body || '{}'))
    if (body.method === 'tools/call') seenBodies.push(body)
    return base(input, init)
  }
  const gateway = createUniversalMcpGateway({
    tenantId: 'tenant-a',
    environmentId: 'test',
    portableId: 'builder',
    env: { GITHUB_MCP_TOKEN: 'token' },
    allowedGitHubRepos: ['SignalBoost/signalboost-live'],
    fetcher,
    audit: { async append() {} },
  })

  const allowed = await gateway.invoke({
    serverId: 'github-mcp',
    capabilityId: 'mcp.github-mcp.code.search',
    args: { query: 'createUniversalMcpGateway' },
  })
  assert.equal(allowed.ok, true)
  assert.match(seenBodies[0]?.params?.arguments?.query || '', /repo:SignalBoost\/signalboost-live/)

  const rejected = await gateway.invoke({
    serverId: 'github-mcp',
    capabilityId: 'mcp.github-mcp.code.search',
    args: { query: 'password repo:other/repo' },
  })
  assert.equal(rejected.ok, false)
  assert.match(rejected.error || '', /universal_mcp_github_repository_rejected/)
})

test('consequential GitHub execution is approved and produces durable-audit-shaped evidence', async () => {
  const calls: string[] = []
  const events: PortableConnectorAuditEvent[] = []
  const gateway = createUniversalMcpGateway({
    tenantId: 'tenant-a',
    environmentId: 'test',
    portableId: 'builder',
    env: { GITHUB_MCP_TOKEN: 'token' },
    allowedGitHubRepos: ['SignalBoost/signalboost-live'],
    fetcher: fakeMcpFetch(calls),
    audit: { async append(event) { events.push(event) } },
  })
  const result = await gateway.invoke({
    serverId: 'github-mcp',
    capabilityId: 'mcp.github-mcp.pull_request.merge',
    args: { owner: 'SignalBoost', repo: 'signalboost-live', pullNumber: 42 },
    approval: { approvalId: 'owner-merge', approvedBy: 'owner', approvedAt: '2026-09-21T18:00:00.000Z' },
  })
  assert.equal(result.ok, true)
  assert.deepEqual(calls, ['merge_pull_request'])
  assert.equal(events.at(-1)?.risk, 'consequential')
  assert.equal(events.at(-1)?.approvalId, 'owner-merge')
})

test('Supabase is project-scoped and unavailable without management access token', async () => {
  const gateway = createUniversalMcpGateway({
    tenantId: 'tenant-a',
    environmentId: 'test',
    portableId: 'builder',
    env: { NEXT_PUBLIC_SUPABASE_URL: 'https://qpblefwtnbivuusxmabv.supabase.co' },
    fetcher: fakeMcpFetch([]),
    audit: { async append() {} },
  })
  const result = await gateway.invoke({
    serverId: 'supabase-mcp',
    capabilityId: 'mcp.supabase-mcp.tables.list',
    args: {},
  })
  assert.equal(result.mode, 'mcp_provider_not_configured')
})


test('owner MCP route derives approval from authenticated owner and never accepts caller approval identity', async () => {
  const source = await readFile(new URL('../app/api/admin/provider-hub/mcp/route.ts', import.meta.url), 'utf8')
  assert.match(source, /requireOwner\(\)/)
  assert.match(source, /body\.approve === true/)
  assert.match(source, /approvedBy: guard\.ctx\.userId/)
  assert.match(source, /owner-mcp:\$\{randomUUID\(\)\}/)
  assert.doesNotMatch(source, /body\.approvalId|body\.approvedBy|body\.approvedAt/)
})

test('durable MCP audit schema never persists tool arguments, results or credentials', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20260921153000_provider_hub_mcp_audit.sql', import.meta.url), 'utf8')
  assert.match(migration, /enable row level security/i)
  assert.match(migration, /revoke all .* anon, authenticated/i)
  for (const forbidden of ['tool_args ', 'tool_arguments ', 'arguments json', 'tool_result ', 'response_body ', 'credentials json', 'access_token ', 'api_key ', 'secret_value ']) {
    assert.equal(migration.toLowerCase().includes(forbidden), false, `audit migration must not persist ${forbidden.trim()}`)
  }
})


test('Figma remains fail-closed without a host-owned OAuth access token', async () => {
  const gateway = createUniversalMcpGateway({
    tenantId: 'tenant-a',
    environmentId: 'test',
    portableId: 'builder',
    env: {},
    fetcher: fakeMcpFetch([]),
    audit: { async append() {} },
  })
  const visible = await gateway.discover('figma-mcp')
  assert.deepEqual(visible, [])
  const result = await gateway.invoke({
    serverId: 'figma-mcp',
    capabilityId: 'mcp.figma-mcp.identity.read',
    args: {},
  })
  assert.equal(result.mode, 'mcp_provider_not_configured')
})

test('Figma OAuth bearer enables only the governed Figma capability projection', async () => {
  const gateway = createUniversalMcpGateway({
    tenantId: 'tenant-a',
    environmentId: 'test',
    portableId: 'builder',
    env: { FIGMA_MCP_OAUTH_ACCESS_TOKEN: 'oauth-access-token' },
    fetcher: fakeMcpFetch([]),
    audit: { async append() {} },
  })
  const visible = await gateway.discover('figma-mcp')
  assert.deepEqual(
    visible.map(item => item.capabilityId).sort(),
    FIGMA_MCP_PROFILE.tools.map(item => `mcp.figma-mcp.${item.capabilityName}`).sort(),
  )
})


test('Vercel remains fail-closed without host-owned OAuth and exact project target', async () => {
  const gateway = createUniversalMcpGateway({
    tenantId: 'tenant-a',
    environmentId: 'test',
    portableId: 'builder',
    env: { VERCEL_MCP_OAUTH_ACCESS_TOKEN: 'oauth-access-token' },
    fetcher: fakeMcpFetch([]),
    audit: { async append() {} },
  })
  const readiness = gateway.readiness.find(item => item.providerId === 'vercel-mcp')
  assert.equal(readiness?.configured, false)
  assert.equal(readiness?.reason, 'missing_target')
  assert.deepEqual(await gateway.discover('vercel-mcp'), [])
})

test('Vercel projects and logs are projected exactly and caller scope cannot escape the configured project', async () => {
  const calls: string[] = []
  const seenBodies: any[] = []
  const seenUrls: string[] = []
  const base = fakeMcpFetch(calls)
  const fetcher: typeof fetch = async (input, init = {}) => {
    const body = JSON.parse(String(init.body || '{}'))
    if (body.method === 'tools/call') {
      seenBodies.push(body)
      seenUrls.push(String(input))
    }
    return base(input, init)
  }
  const gateway = createUniversalMcpGateway({
    tenantId: 'tenant-a',
    environmentId: 'test',
    portableId: 'builder',
    env: {
      VERCEL_MCP_OAUTH_ACCESS_TOKEN: 'oauth-access-token',
      VERCEL_MCP_TEAM_SLUG: 'signalboost',
      VERCEL_MCP_PROJECT_SLUG: 'signalboost-live',
    },
    fetcher,
    audit: { async append() {} },
  })

  const visible = await gateway.discover('vercel-mcp')
  assert.deepEqual(
    visible.map(item => item.capabilityId).sort(),
    VERCEL_MCP_PROFILE.tools.map(item => `mcp.vercel-mcp.${item.capabilityName}`).sort(),
  )

  const allowed = await gateway.invoke({
    serverId: 'vercel-mcp',
    capabilityId: 'mcp.vercel-mcp.project.read',
    args: {},
  })
  assert.equal(allowed.ok, true)
  assert.equal(seenBodies.at(-1)?.params?.arguments?.teamId, undefined)
  assert.equal(seenBodies.at(-1)?.params?.arguments?.projectId, undefined)
  assert.equal(new URL(seenUrls.at(-1) || '').pathname, '/signalboost/signalboost-live')

  const rejected = await gateway.invoke({
    serverId: 'vercel-mcp',
    capabilityId: 'mcp.vercel-mcp.project.read',
    args: { teamId: 'signalboost', projectId: 'other-project' },
  })
  assert.equal(rejected.ok, false)
  assert.match(rejected.error || '', /universal_mcp_vercel_project_rejected/)
})
