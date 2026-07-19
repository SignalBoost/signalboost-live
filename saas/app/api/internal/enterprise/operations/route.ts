import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { SupabaseOperationsSnapshotStore } from '@/lib/enterprise/operations/operationsSnapshotStore'

const SCHEMA_VERSION = 'operations-intelligence-response-v1'

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const organizationId = new URL(req.url).searchParams.get('organizationId')?.trim() || ''
  if (!organizationId) {
    return NextResponse.json(
      { schemaVersion: SCHEMA_VERSION, error: 'organizationId is required.' },
      { status: 400 },
    )
  }

  try {
    const store = new SupabaseOperationsSnapshotStore(auth.admin)
    const snapshot = await store.getLatest(organizationId)
    if (!snapshot) {
      return NextResponse.json(
        { schemaVersion: SCHEMA_VERSION, error: 'No operations snapshot is available for this organization.' },
        { status: 404 },
      )
    }

    return NextResponse.json({ schemaVersion: SCHEMA_VERSION, snapshot })
  } catch {
    return NextResponse.json(
      { schemaVersion: SCHEMA_VERSION, error: 'Unable to load operations intelligence.' },
      { status: 503 },
    )
  }
}
