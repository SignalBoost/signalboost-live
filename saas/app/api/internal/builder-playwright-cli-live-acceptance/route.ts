import { NextResponse } from 'next/server'
import { runBuilderPlaywrightCliLiveAcceptance } from '@/lib/builder/playwright-cli-live-acceptance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== 'preview') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // The live probe provisions a billable sandbox: never expose it anonymously.
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const result = await runBuilderPlaywrightCliLiveAcceptance()
  return NextResponse.json(result, { status: result.ok ? 200 : 503 })
}
