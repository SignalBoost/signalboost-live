import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { readCosUniversityProductionVerification } from '@/lib/ai/cos/cosUniversityProductionVerification'
import { recordFineTuneHostApproval, type FineTuneHostClaim } from '@/lib/ai/cos/cosUniversityFineTuneEvidence'

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

export async function POST(request: Request) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  let body: any = null
  try { body = await request.json() } catch { body = null }
  const claim = String(body?.claim || '') as FineTuneHostClaim
  if (!['dataset_approved', 'training_approved'].includes(claim)) {
    return NextResponse.json({ ok: false, error: 'host_claim_not_permitted' }, { status: 400 })
  }
  try {
    const result = await recordFineTuneHostApproval({
      candidateId: String(body?.candidateId || ''), subjectId: body?.subjectId ? String(body.subjectId) : null,
      claim, evidenceRef: String(body?.evidenceRef || ''),
      revision: {
        baseModel: String(body?.baseModel || ''), datasetHash: String(body?.datasetHash || ''),
        trainingManifestHash: String(body?.trainingManifestHash || ''), holdoutManifestHash: String(body?.holdoutManifestHash || ''),
      },
    })
    return NextResponse.json(result, { status: result.ok ? 200 : 400, headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
