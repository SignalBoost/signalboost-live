import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import {
  COS_UNIVERSITY_MASTERS_PROGRAMS,
  type CosUniversityMastersProgramId,
} from '@/lib/ai/cos/cosUniversityMasters'
import {
  ensureCosUniversityMastersEnrollment,
  evaluateAndAwardCosUniversityMastersCredential,
  readCosUniversityMastersRuntimeStatus,
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

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  try {
    const ids = Object.keys(COS_UNIVERSITY_MASTERS_PROGRAMS) as CosUniversityMastersProgramId[]
    const programs = await Promise.all(ids.map(id => readCosUniversityMastersRuntimeStatus(id)))
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

/** Owner may request evaluation; the host issues a credential only from current durable evidence. */
export async function PUT(request: Request) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const body = await request.json().catch(() => ({})) as { programId?: unknown }
  const id = programId(body.programId)
  if (!id) return NextResponse.json({ ok: false, error: 'A valid Master’s program is required.' }, { status: 400 })
  try {
    const result = await evaluateAndAwardCosUniversityMastersCredential(id)
    const status = result.state === 'error' ? 500 : result.state === 'not_eligible' ? 409 : 200
    return NextResponse.json({ ok: result.state !== 'error', ...result }, { status })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
