import { NextResponse } from 'next/server'
import { createUniversalMcpGateway } from '@/provider-hub-host/universal-mcp-gateway'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

type Check = { name: string; passed: boolean; detail: string }

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const checks: Check[] = []
  const add = (name: string, passed: boolean, detail: string) => checks.push({ name, passed, detail })

  const gateway = createUniversalMcpGateway({
    tenantId: 'signalboost-preview-acceptance',
    environmentId: 'vercel-preview',
    portableId: 'mcp-live-acceptance',
    actor: { userId: 'vercel-preview', roles: ['acceptance'] },
    allowedGitHubRepos: ['SignalBoost/signalboost-live'],
    audit: { async append() {} },
  })

  try {
    const context7 = await gateway.discover('context7-mcp')
    add(
      'context7_exact_projection',
      context7.length === 2 &&
        context7.some(item => item.capabilityId === 'mcp.context7-mcp.library.resolve') &&
        context7.some(item => item.capabilityId === 'mcp.context7-mcp.docs.query'),
      `capabilities=${context7.length}`,
    )
    const context7Lookup = await gateway.invoke({
      serverId: 'context7-mcp',
      capabilityId: 'mcp.context7-mcp.library.resolve',
      args: { libraryName: 'next.js', query: 'App Router route handlers' },
    })
    add('context7_real_lookup', context7Lookup.ok, `mode=${context7Lookup.mode || 'none'}`)
  } catch (error) {
    add('context7_runtime', false, error instanceof Error ? error.message : 'unknown_error')
  }

  try {
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
  } catch (error) {
    add('github_runtime', false, error instanceof Error ? error.message : 'unknown_error')
  }

  try {
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
  } catch (error) {
    add('supabase_runtime', false, error instanceof Error ? error.message : 'unknown_error')
  }

  const failed = checks.filter(check => !check.passed)
  return NextResponse.json({
    ok: failed.length === 0,
    schemaVersion: 'universal-mcp-preview-live-acceptance-v1',
    checks,
  }, { status: failed.length === 0 ? 200 : 503 })
}
