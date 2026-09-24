import { NextResponse } from 'next/server'
import { runBuilderPlaywrightCliLiveAcceptance } from '@/lib/builder/playwright-cli-live-acceptance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const result = await runBuilderPlaywrightCliLiveAcceptance()
  return NextResponse.json(result, { status: result.ok ? 200 : 503 })
}
