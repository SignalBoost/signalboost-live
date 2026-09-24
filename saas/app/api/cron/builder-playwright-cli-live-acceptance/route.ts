import { withScheduledProductionHarnessIngress } from '@/platform-harness/runtime/scheduled-ingress'
import { NextResponse } from 'next/server'
import { runBuilderPlaywrightCliLiveAcceptance } from '@/lib/builder/playwright-cli-live-acceptance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

async function GETInsideScheduledHarness(request: Request) {
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


// Platform Harness scheduled ingress: no background worker logic starts outside a bounded run.
export async function GET(...args: Parameters<typeof GETInsideScheduledHarness>) {
  return withScheduledProductionHarnessIngress({ routePath: '/api/cron/builder-playwright-cli-live-acceptance' }, async () => GETInsideScheduledHarness(...args))
}
