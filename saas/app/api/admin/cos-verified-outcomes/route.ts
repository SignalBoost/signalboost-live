import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { listOwnerVerifiableTurns, recordOwnerVerifiedTurnOutcome } from '@/lib/ai/cos/cosOwnerVerifiedOutcomes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok || !guard.ctx.userId) return NextResponse.json({ ok: false, error: guard.error || 'Owner access required.', authRequired: true }, { status: guard.status || 401 })
  try {
    return NextResponse.json({ ok: true, turns: await listOwnerVerifiableTurns(guard.ctx.userId) }, { headers: NO_STORE })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500, headers: NO_STORE })
  }
}

export async function POST(request: Request) {
  const guard = await requireOwner()
  if (!guard.ok || !guard.ctx.userId) return NextResponse.json({ ok: false, error: guard.error || 'Owner access required.', authRequired: true }, { status: guard.status || 401 })
  let body: any = null
  try { body = await request.json() } catch { body = null }
  try {
    const result = await recordOwnerVerifiedTurnOutcome({
      userId: guard.ctx.userId,
      request: {
        turnId: String(body?.turnId || ''),
        outcome: body?.outcome,
        evidenceRef: String(body?.evidenceRef || ''),
        summary: String(body?.summary || ''),
      },
    })
    return NextResponse.json(result, { status: result.ok ? 200 : 400, headers: NO_STORE })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500, headers: NO_STORE })
  }
}
