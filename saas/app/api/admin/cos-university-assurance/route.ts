import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { readCosUniversityProductionVerification } from '@/lib/ai/cos/cosUniversityProductionVerification'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  try {
    const result = await readCosUniversityProductionVerification()
    return NextResponse.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (error) {
    return NextResponse.json({ ok: false, verified: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
