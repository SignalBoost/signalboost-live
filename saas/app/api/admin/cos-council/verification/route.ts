import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  CouncilVerificationError,
  recordCouncilVerifiedOutcome,
} from '@/lib/ai/cos/councilVerification'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error, authRequired: guard.status === 401 }, { status: guard.status })

  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'COS service database is unavailable.' }, { status: 503 })

  try {
    const [pending, verified, credibility] = await Promise.all([
      db.from('cos_council_sessions')
        .select('id,problem_class,trigger_reasons,metacognitive_region,repeated_gap_count,high_consequence,evidence_sparse,selected_roles,challenge_count,created_at,completed_at', { count: 'exact' })
        .eq('status', 'deliberated')
        .order('completed_at', { ascending: false })
        .limit(25),
      db.from('cos_council_sessions').select('id', { count: 'exact', head: true }).eq('status', 'verified'),
      db.from('cos_council_member_credibility').select('id', { count: 'exact', head: true }),
    ])

    if (pending.error) throw pending.error
    if (verified.error) throw verified.error
    if (credibility.error) throw credibility.error

    return NextResponse.json({
      ok: true,
      pendingVerificationCount: Number(pending.count ?? 0),
      verifiedSessionCount: Number(verified.count ?? 0),
      credibilityRowCount: Number(credibility.count ?? 0),
      pendingSessions: pending.data ?? [],
      verificationPolicy: {
        acceptedSources: ['deterministic_tool', 'human_review', 'production_outcome', 'authoritative_record'],
        rejectedAsAuthority: ['model_consensus', 'Council consensus', 'LLM self-evaluation'],
      },
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Unable to read Council verification state.' },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error, authRequired: guard.status === 401 }, { status: guard.status })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Request body must be valid JSON.' }, { status: 400 })
  }

  try {
    const result = await recordCouncilVerifiedOutcome(body)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof CouncilVerificationError) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: error.status })
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Council verification failed.' },
      { status: 500 },
    )
  }
}
