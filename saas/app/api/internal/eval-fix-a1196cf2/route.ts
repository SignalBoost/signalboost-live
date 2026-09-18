import { createHash, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { GET as runEvaluation } from '../../cron/cos-university-distilled-evaluation/route.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 600

const TOKEN_HASH = 'a1196cf279a1786b2c180b2d6355dc6c2c2525ed1188900826d07d30a6e7b6c5'

function authorized(token: string | null): boolean {
  if (!token) return false
  const actual = createHash('sha256').update(token).digest()
  const expected = Buffer.from(TOKEN_HASH, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export async function GET(req: NextRequest) {
  if (!authorized(req.nextUrl.searchParams.get('token'))) {
    return NextResponse.json({ ok: false }, { status: 404 })
  }

  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'cron_secret_missing' }, { status: 500 })
  }

  const internal = new NextRequest(new URL('/api/cron/cos-university-distilled-evaluation', req.url), {
    headers: { authorization: `Bearer ${secret}` },
  })
  return runEvaluation(internal)
}
