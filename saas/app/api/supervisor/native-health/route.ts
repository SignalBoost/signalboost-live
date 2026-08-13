import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'signalboost-saas-api',
    observedAt: new Date().toISOString(),
  }, {
    status: 200,
    headers: { 'cache-control': 'no-store, max-age=0' },
  })
}
