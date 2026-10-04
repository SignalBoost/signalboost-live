// saas/app/api/admin/cos-university-artifact-life/route.ts
//
// The VIN lookup: one artifact's whole life, read by its permanent artifact ID (or candidate ID, or exact artifact
// hash). Owner, 2026-10-04: "we need to know all about each artifact's life like we do for humans."
//
// GET ?id=<permanent_artifact_id | candidate_id | trained_artifact_hash> -> the life record, every chapter naming the
// table it was read from. Owner only. Nothing here changes any record.
import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { getAdminSupabase } from '@/utils/supabase/server'
import { describeArtifactLife, readArtifactLifeRecord } from '@/lib/ai/cos/cosUniversityArtifactLifeRecord'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }

export async function GET(req: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error, authRequired: true }, { status: guard.status, headers: NO_STORE })
  }
  const id = req.nextUrl.searchParams.get('id')
  try {
    const result = await readArtifactLifeRecord({ db: getAdminSupabase(), lookup: id })
    if (result.ok === false) {
      const status = result.error === 'lookup_key_invalid' ? 400 : result.error === 'artifact_not_found' ? 404 : 500
      return NextResponse.json({ ok: false, error: result.error, ...(result.detail ? { detail: result.detail } : {}) }, { status, headers: NO_STORE })
    }
    return NextResponse.json({ ok: true, summary: describeArtifactLife(result.record), record: result.record }, { headers: NO_STORE })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500, headers: NO_STORE })
  }
}
// end of saas/app/api/admin/cos-university-artifact-life/route.ts (if this line is missing, the paste was cut short)
