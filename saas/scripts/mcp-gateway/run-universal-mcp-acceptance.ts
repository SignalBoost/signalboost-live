import { mkdir, writeFile } from 'node:fs/promises'
import { createUniversalMcpGateway } from '../../provider-hub-host/universal-mcp-gateway.ts'

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

  const github = await gateway.discover('github-mcp')
  add(
    'github_governed_projection',
    github.some(item => item.capabilityId === 'mcp.github-mcp.contents.read') &&
      !github.some(item => item.capabilityId.includes('delete_repository')),
    `capabilities=${github.length}`,
  )
  const githubRead = await gateway.invoke({
    serverId: 'github-mcp',
    capabilityId: 'mcp.github-mcp.contents.read',
    args: { owner: 'SignalBoost', repo: 'signalboost-live', path: 'ONBOARD.md', ref: 'main' },
  })
  add('github_real_private_repo_read', githubRead.ok, `mode=${githubRead.mode || 'none'}`)

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
    schemaVersion: 'universal-mcp-live-acceptance-v1',
    observedAt: new Date().toISOString(),
    providers: gateway.readiness.map(item => ({
      providerId: item.providerId,
      configured: item.configured,
      reason: item.reason,
      authentication: item.authentication,
    })),
    checks,
  }
  await mkdir('artifacts', { recursive: true })
  await writeFile('artifacts/universal-mcp-live-acceptance.json', JSON.stringify(evidence, null, 2) + '\n')

  for (const check of checks) console.log(`${check.passed ? 'PASS' : 'FAIL'} ${check.name}: ${check.detail}`)
  const failed = checks.filter(check => !check.passed)
  if (failed.length) throw new Error(`universal_mcp_live_acceptance_failed:${failed.map(item => item.name).join(',')}`)
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
