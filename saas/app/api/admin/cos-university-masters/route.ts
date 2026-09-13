import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import {
  COS_UNIVERSITY_MASTERS_PROGRAMS,
  type CosUniversityMastersProgramId,
} from '@/lib/ai/cos/cosUniversityMasters'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  COS_UNIVERSITY_PRODUCTION_OUTCOME_NAMESPACE,
  cosUniversityEvidenceSupply,
} from '@/lib/ai/cos/cosUniversityEvidenceSupply'
import {
  ensureCosUniversityMastersEnrollment,
  evaluateAndAwardCosUniversityMastersCredential,
  readCosUniversityMastersRuntimeStatus,
  readCosUniversityMastersSharedAdmissionState,
} from '@/lib/ai/cos/cosUniversityMastersRuntime'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function programId(value: unknown): CosUniversityMastersProgramId | null {
  const id = String(value || '').trim()
  return Object.prototype.hasOwnProperty.call(COS_UNIVERSITY_MASTERS_PROGRAMS, id)
    ? id as CosUniversityMastersProgramId
    : null
}

/**
 * Whether any verified-production outcome exists to draw practical-work evidence from. Existence
 * only — the supplying lane still decides which outcomes match a programme. Reported here rather
 * than inside the runtime status so the academic read path keeps its exact query set.
 */
async function productionOutcomesObserved(): Promise<number> {
  const db = cosServiceDb()
  if (!db) return 0
  const result = await db.from('cos_turn_outcomes')
    .select('turn_id')
    .like('outcome_source', `${COS_UNIVERSITY_PRODUCTION_OUTCOME_NAMESPACE}%`)
    .limit(1)
  if (result.error) return 0
  return (result.data || []).length
}

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  try {
    const now = new Date()
    const sharedAdmissionState = await readCosUniversityMastersSharedAdmissionState(now)
    const ids = Object.keys(COS_UNIVERSITY_MASTERS_PROGRAMS) as CosUniversityMastersProgramId[]
    const [statuses, observed] = await Promise.all([
      Promise.all(ids.map(id => readCosUniversityMastersRuntimeStatus(id, now, sharedAdmissionState))),
      productionOutcomesObserved(),
    ])
    // `verified_practical_work_incomplete` cannot say whether the learner is behind or whether
    // nothing writes this kind of evidence at all. Both read identically on the board, and today
    // the second is the true one, so the distinction is reported beside the blocker.
    const programs = statuses.map(status => ({
      ...status,
      practicalEvidenceSupply: cosUniversityEvidenceSupply({
        required: COS_UNIVERSITY_MASTERS_PROGRAMS[status.programId].minimumDistinctPracticalPasses,
        earned: status.graduation.blockers.includes('verified_practical_work_incomplete') ? 0 : 1,
        observed,
      }),
    }))
    return NextResponse.json({
      ok: true,
      programs,
      academicEvidenceWriteExposed: false,
      semantics: 'owner_read_enroll_evaluate_only_host_controls_academic_evidence',
    })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

/** Owner may request enrollment; host-computed prerequisites still decide admission. */
export async function POST(request: Request) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const body = await request.json().catch(() => ({})) as { programId?: unknown }
  const id = programId(body.programId)
  if (!id) return NextResponse.json({ ok: false, error: 'A valid Master’s program is required.' }, { status: 400 })
  try {
    const result = await ensureCosUniversityMastersEnrollment(id)
    const status = result.state === 'error' ? 500 : result.state === 'admission_denied' ? 409 : 200
    return NextResponse.json({ ok: result.state !== 'error', ...result }, { status })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

/** Owner may request evaluation; host evidence still targets A+ until the program target date passes. */
export async function PUT(request: Request) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const body = await request.json().catch(() => ({})) as { programId?: unknown }
  const id = programId(body.programId)
  if (!id) return NextResponse.json({ ok: false, error: 'A valid Master’s program is required.' }, { status: 400 })
  try {
    const current = await readCosUniversityMastersRuntimeStatus(id)
    if (current.graduation.standing === 'A' && current.timingStatus !== 'target_date_passed') {
      return NextResponse.json({
        ok: true,
        awarded: false,
        state: 'not_eligible',
        status: current,
        reasons: ['masters_A_plus_pursuit_active_until_target_date'],
      }, { status: 200 })
    }
    const result = await evaluateAndAwardCosUniversityMastersCredential(id)
    const status = result.state === 'error' ? 500 : result.state === 'not_eligible' ? 409 : 200
    return NextResponse.json({ ok: result.state !== 'error', ...result }, { status })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
