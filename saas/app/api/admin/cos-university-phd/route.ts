import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import {
  COS_UNIVERSITY_PHD_PROGRAMS,
  type CosUniversityPhdProgramId,
} from '@/lib/ai/cos/cosUniversityPhd'
import {
  ensureCosUniversityPhdEnrollment,
  evaluateAndAwardCosUniversityPhdCredential,
  readCosUniversityPhdRuntimeStatus,
} from '@/lib/ai/cos/cosUniversityPhdRuntime'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function programId(value: unknown): CosUniversityPhdProgramId | null {
  const id = String(value || '').trim()
  return Object.prototype.hasOwnProperty.call(COS_UNIVERSITY_PHD_PROGRAMS, id)
    ? id as CosUniversityPhdProgramId
    : null
}

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  try {
    const now = new Date()
    const ids = Object.keys(COS_UNIVERSITY_PHD_PROGRAMS) as CosUniversityPhdProgramId[]
    const programs = await Promise.all(ids.map(id => readCosUniversityPhdRuntimeStatus(id, now)))
    return NextResponse.json({
      ok: true,
      programs,
      researchNeedWriteExposed: false,
      actorIdentityWriteExposed: false,
      projectWriteExposed: false,
      academicEvidenceWriteExposed: false,
      semantics: 'owner_read_enroll_evaluate_only_host_controls_phd_research_evidence',
    })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

/** Owner may request enrollment; the host still requires an awarded relevant Master’s and a current host research-need record. */
export async function POST(request: Request) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const body = await request.json().catch(() => ({})) as { programId?: unknown }
  const id = programId(body.programId)
  if (!id) return NextResponse.json({ ok: false, error: 'A valid PhD research program is required.' }, { status: 400 })
  try {
    const result = await ensureCosUniversityPhdEnrollment(id)
    const status = result.state === 'error' ? 500 : result.state === 'admission_denied' ? 409 : 200
    return NextResponse.json({ ok: result.state !== 'error', ...result }, { status })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

/** Owner may request evaluation. Credential issuance remains host-computed from immutable evidence and principal separation. */
export async function PUT(request: Request) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const body = await request.json().catch(() => ({})) as { programId?: unknown }
  const id = programId(body.programId)
  if (!id) return NextResponse.json({ ok: false, error: 'A valid PhD research program is required.' }, { status: 400 })
  try {
    const result = await evaluateAndAwardCosUniversityPhdCredential(id)
    const status = result.state === 'error' ? 500 : result.state === 'not_eligible' ? 409 : 200
    return NextResponse.json({ ok: result.state !== 'error', ...result }, { status })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
