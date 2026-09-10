import { NextRequest, NextResponse } from 'next/server'
import { syncCosUniversityMastersProductionEvidence } from '@/lib/ai/cos/cosUniversityMastersProductionEvidence'
import {
  evaluateAndAwardCosUniversityMastersCredential,
  readCosUniversityMastersRuntimeStatus,
} from '@/lib/ai/cos/cosUniversityMastersRuntime'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const production = await syncCosUniversityMastersProductionEvidence()
    let credential = null
    let deferredForAPlus = false
    if (production.programId) {
      const current = await readCosUniversityMastersRuntimeStatus(production.programId)
      const mayFinalizeA = current.timingStatus === 'target_date_passed'
      if (current.graduation.standing === 'A+' || mayFinalizeA) {
        credential = await evaluateAndAwardCosUniversityMastersCredential(production.programId)
      } else if (current.graduation.standing === 'A') {
        deferredForAPlus = true
      }
    }
    const errors = [...production.errors, ...(credential?.state === 'error' ? credential.reasons : [])]
    await recordCosUniversityProductionPath({ path: 'masters_progress', invocationSucceeded: errors.length === 0, evidence: { production, credential, deferredForAPlus, errors } })
    return NextResponse.json({ ok: errors.length === 0, production, credential, deferredForAPlus, errors }, { status: errors.length ? 500 : 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
