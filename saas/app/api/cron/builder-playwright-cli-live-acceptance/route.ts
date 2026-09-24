import { NextResponse } from 'next/server'
import { runBuilderPlaywrightCliLiveAcceptance } from '@/lib/builder/playwright-cli-live-acceptance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== 'production') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const result = await runBuilderPlaywrightCliLiveAcceptance()
  console.info('[builder_playwright_cli_production_acceptance]', {
    ok: result.ok,
    schemaVersion: result.schemaVersion,
    commitSha: String(process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 12),
    checks: result.checks.map(check => ({
      name: check.name,
      passed: check.passed,
      detail: check.detail,
    })),
  })

  return NextResponse.json(result, { status: result.ok ? 200 : 503 })
}
