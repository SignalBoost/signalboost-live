import { NextRequest, NextResponse } from 'next/server'
import { syncCosUniversityMastersProductionEvidence } from '@/lib/ai/cos/cosUniversityMastersProductionEvidence'
import { evaluateAndAwardCosUniversityMastersCredential } from '@/lib/ai/cos/cosUniversityMastersRuntime'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const production = await syncCosUniversityMastersProductionEvidence()
    const credential = production.programId
      ? await evaluateAndAwardCosUniversityMastersCredential(production.programId)
      : null
    const errors = [...production.errors, ...(credential?.state === 'error' ? credential.reasons : [])]
    return NextResponse.json({ ok: errors.length === 0, production, credential, errors }, { status: errors.length ? 500 : 200 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
