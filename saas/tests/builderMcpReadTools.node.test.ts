import assert from 'node:assert/strict'
import test from 'node:test'

import type { BuilderMcpReadPort, BuilderRunnerPort } from '../lib/builder/contracts.ts'
import { BUILDER_MCP_READ_CATALOG, createBuilderMcpReadPort } from '../lib/builder/mcp-read-port.ts'
import { BuilderToolLoop } from '../lib/builder/tool-loop.ts'
import { InMemoryBuilderWorkspace } from '../lib/builder/workspace.ts'
import { UNIVERSAL_MCP_PROFILES } from '../provider-hub-host/universal-mcp-profiles.ts'

const idleRunner: BuilderRunnerPort = {
  async run() {
    assert.fail('MCP read-only inspection must not execute workspace commands')
  },
}

test('Builder can consume a governed MCP read and use its result in the next reasoning round', async () => {
  const prompts: string[] = []
  const calls: Array<{ providerId: string; capabilityId: string; args: Readonly<Record<string, unknown>> }> = []
  const responses = [
    JSON.stringify({
      type: 'tool',
      toolId: 'mcp_read',
      input: {
        providerId: 'context7-mcp',
        capabilityId: 'mcp.context7-mcp.docs.query',
        args: { libraryId: '/vercel/next.js', query: 'App Router route handlers' },
      },
    }),
    JSON.stringify({ type: 'answer', answer: 'The current documentation evidence is recorded.' }),
  ]
  const mcp: BuilderMcpReadPort = {
    async capabilities() {
      return [{ providerId: 'context7-mcp', capabilityId: 'mcp.context7-mcp.docs.query' }]
    },
    async invoke(input) {
      calls.push(input)
      return {
        ok: true,
        data: { answer: 'Route Handlers use the Web Request and Response APIs.' },
      }
    },
  }
  const ai = {
    async generate(input: { prompt: string }) {
      prompts.push(input.prompt)
      return responses.shift() || null
    },
  }

  const result = await new BuilderToolLoop(ai, new InMemoryBuilderWorkspace(), idleRunner, mcp).run({
    objective: 'Check the current Next.js documentation for App Router route handlers and explain it.',
    workspaceId: 'builder-mcp-read',
    maxRounds: 3,
  })

  assert.equal(result.ok, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.providerId, 'context7-mcp')
  assert.equal(calls[0]?.capabilityId, 'mcp.context7-mcp.docs.query')
  assert.equal(result.trace.some(item => item.toolId === 'mcp_read' && item.ok), true)
  assert.match(prompts[0] || '', /MCP READ CAPABILITIES/)
  assert.match(prompts[1] || '', /Route Handlers use the Web Request and Response APIs/)
})

test('Builder MCP catalog contains reads only and excludes credential/binary-oriented reads', () => {
  for (const capability of BUILDER_MCP_READ_CATALOG) {
    const profile = UNIVERSAL_MCP_PROFILES.find(item => item.profileId === capability.providerId)
    assert.ok(profile, capability.providerId)
    const tool = profile.tools.find(item =>
      `mcp.${profile.profileId}.${item.capabilityName}` === capability.capabilityId,
    )
    assert.equal(tool?.risk, 'read', capability.capabilityId)
    assert.equal(tool?.requiresApproval, false, capability.capabilityId)
  }

  const ids = new Set(BUILDER_MCP_READ_CATALOG.map(item => item.capabilityId))
  assert.equal(ids.has('mcp.github-mcp.pull_request.merge'), false)
  assert.equal(ids.has('mcp.supabase-mcp.sql.execute'), false)
  assert.equal(ids.has('mcp.figma-mcp.canvas.mutate'), false)
  assert.equal(ids.has('mcp.figma-mcp.screenshot.read'), false)
  assert.equal(ids.has('mcp.supabase-mcp.publishable_keys.read'), false)
})

test('ordinary Builder receives public Context7 only; owner Builder can receive configured host reads', async () => {
  const ordinary = createBuilderMcpReadPort({
    tenantId: 'tenant-user',
    userId: 'user',
    environmentId: 'test',
    ownerAuthorized: false,
    env: {
      GITHUB_MCP_TOKEN: 'host-github',
      SUPABASE_ACCESS_TOKEN: 'host-supabase',
      SUPABASE_MCP_PROJECT_REF: 'projectref',
      FIGMA_MCP_OAUTH_ACCESS_TOKEN: 'host-figma',
      VERCEL_MCP_OAUTH_ACCESS_TOKEN: 'host-vercel',
      VERCEL_MCP_TEAM_SLUG: 'team',
      VERCEL_MCP_PROJECT_SLUG: 'project',
    },
  })
  assert.deepEqual(
    [...new Set((await ordinary.capabilities()).map(item => item.providerId))],
    ['context7-mcp'],
  )

  const owner = createBuilderMcpReadPort({
    tenantId: 'owner',
    userId: 'owner',
    environmentId: 'test',
    ownerAuthorized: true,
    env: {
      GITHUB_MCP_TOKEN: 'host-github',
      SUPABASE_ACCESS_TOKEN: 'host-supabase',
      SUPABASE_MCP_PROJECT_REF: 'projectref',
      FIGMA_MCP_OAUTH_ACCESS_TOKEN: 'host-figma',
      VERCEL_MCP_OAUTH_ACCESS_TOKEN: 'host-vercel',
      VERCEL_MCP_TEAM_SLUG: 'team',
      VERCEL_MCP_PROJECT_SLUG: 'project',
    },
  })
  assert.deepEqual(
    [...new Set((await owner.capabilities()).map(item => item.providerId))].sort(),
    ['context7-mcp', 'figma-mcp', 'github-mcp', 'supabase-mcp', 'vercel-mcp'],
  )
})
