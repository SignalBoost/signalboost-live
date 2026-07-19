import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { SupabaseOperationsSnapshotStore } from '@/lib/enterprise/operations/operationsSnapshotStore'

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const organizationId = new URL(req.url).searchParams.get('organizationId')?.trim() || ''
  if (!organizationId) {
    return NextResponse.json(
      { schemaVersion: 'operations-intelligence-response-v1', error: 'organizationId is required.' },
      { status: 400 },
    )
  }

  try {
    const store = new SupabaseOperationsSnapshotStore(auth.admin)
    const snapshot = await store.getLatest(organizationId)
    if (!snapshot) {
      return NextResponse.json(
        { schemaVersion: 'operations-intelligence-response-v1', error: 'No operations snapshot is available for this organization.' },
        { status: 404 },
      )
    }

    return NextResponse.json({ schemaVersion: 'operations-intelligence-response-v1', snapshot })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load operations intelligence.'
    return NextResponse.json(
      { schemaVersion: 'operations-intelligence-response-v1', error: message },
      { status: 503 },
    )
  }
}
