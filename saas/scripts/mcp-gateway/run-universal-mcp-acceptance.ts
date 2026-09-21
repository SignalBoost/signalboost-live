import { mkdir, writeFile } from 'node:fs/promises'
import { certifyMcpProvider } from '../../provider-hub-host/mcp-certification.ts'
import { createUniversalMcpGateway } from '../../provider-hub-host/universal-mcp-gateway.ts'
import { GITHUB_MCP_PROFILE } from '../../provider-hub-host/universal-mcp-profiles.ts'

const checks: Array<{ name: string; passed: boolean; detail: string }> = []
const add = (name: string, passed: boolean, detail: string) => checks.push({ name, passed, detail })

async function run() {
  const gateway = createUniversalMcpGateway({
    tenantId: 'signalboost-live-acceptance',
    environmentId: 'github-actions',
    portableId: 'mcp-live-acceptance',
    actor: { userId: 'github-actions', roles: ['acceptance'] },
    allowedGitHubRepos: ['SignalBoost/signalboost-live'],
    audit: { async append() {} },
  })

  const context7 = await gateway.discover('context7-mcp')
  add(
    'context7_exact_projection',
    context7.length === 2 &&
      context7.some(item => item.capabilityId === 'mcp.context7-mcp.library.resolve') &&
      context7.some(item => item.capabilityId === 'mcp.context7-mcp.docs.query'),
    `capabilities=${context7.length}`,
  )
  const resolved = await gateway.invoke({
    serverId: 'context7-mcp',
    capabilityId: 'mcp.context7-mcp.library.resolve',
    args: { libraryName: 'next.js', query: 'App Router route handlers' },
  })
  add('context7_real_lookup', resolved.ok, `mode=${resolved.mode || 'none'}`)

  const githubCertification = await certifyMcpProvider(gateway, {
    providerId: 'github-mcp',
    expectedCapabilities: GITHUB_MCP_PROFILE.tools.map(item => `mcp.github-mcp.${item.capabilityName}`),
    probes: [
      {
        id: 'private_repo_read',
        capabilityId: 'mcp.github-mcp.contents.read',
        args: { owner: 'SignalBoost', repo: 'signalboost-live', path: 'ONBOARD.md', ref: 'main' },
        expect: { ok: true },
      },
      {
        id: 'cross_repo_scope_rejected',
        capabilityId: 'mcp.github-mcp.contents.read',
        args: { owner: 'other', repo: 'repo', path: 'README.md', ref: 'main' },
        expect: { ok: false, errorIncludes: 'universal_mcp_github_repository_rejected' },
      },
    ],
  })
  for (const item of githubCertification.checks) {
    add(`github_certification_${item.id.replace(/[^a-z0-9_-]+/gi, '_')}`, item.passed, item.detail)
  }

  const supabaseReady = gateway.readiness.find(item => item.providerId === 'supabase-mcp')
  add('supabase_management_credential_present', supabaseReady?.configured === true, supabaseReady?.reason || 'missing')
  if (supabaseReady?.configured) {
    const supabase = await gateway.discover('supabase-mcp')
    add(
      'supabase_governed_projection',
      supabase.some(item => item.capabilityId === 'mcp.supabase-mcp.tables.list') &&
        supabase.some(item => item.capabilityId === 'mcp.supabase-mcp.migration.apply'),
      `capabilities=${supabase.length}`,
    )
    const tables = await gateway.invoke({
      serverId: 'supabase-mcp',
      capabilityId: 'mcp.supabase-mcp.tables.list',
      args: { schemas: ['public'] },
    })
    add('supabase_real_project_read', tables.ok, `mode=${tables.mode || 'none'}`)
  }

  const evidence = {
    schemaVersion: 'universal-mcp-live-acceptance-v2',
    observedAt: new Date().toISOString(),
    providers: gateway.readiness.map(item => ({
      providerId: item.providerId,
      configured: item.configured,
      reason: item.reason,
      authentication: item.authentication,
    })),
    certifications: [githubCertification],
    checks,
  }
  await mkdir('artifacts', { recursive: true })
  await writeFile('artifacts/universal-mcp-live-acceptance.json', JSON.stringify(evidence, null, 2) + '\n')

  for (const item of checks) console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}: ${item.detail}`)
  const failed = checks.filter(item => !item.passed)
  if (failed.length) throw new Error(`universal_mcp_live_acceptance_failed:${failed.map(item => item.name).join(',')}`)
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
