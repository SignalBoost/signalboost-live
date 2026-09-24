import { NextResponse } from 'next/server'
import { runPlaywrightMcpProductionAcceptance } from '@/provider-hub-host/playwright-mcp-sandbox-acceptance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 240

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== 'production') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const result = await runPlaywrightMcpProductionAcceptance()
  console.info('[playwright_mcp_production_acceptance]', {
    ok: result.ok,
    schemaVersion: result.schemaVersion,
    packageName: result.packageName,
    packageVersion: result.packageVersion,
    commitSha: String(process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 12),
    checks: result.checks,
  })
  return NextResponse.json(result, { status: result.ok ? 200 : 503 })
}
