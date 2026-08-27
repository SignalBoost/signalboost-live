import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/utils/supabase/server.ts'
import { googleWorkspaceOAuthConfigured } from '@/lib/google-workspace/oauth.ts'
import {
  deleteGoogleWorkspaceConnection,
  getGoogleWorkspaceConnectionStatus,
} from '@/lib/google-workspace/token-store.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
  const connection = await getGoogleWorkspaceConnectionStatus(user.id)
  return NextResponse.json({
    ok: true,
    configured: googleWorkspaceOAuthConfigured(),
    connection,
    connectUrl: `${req.nextUrl.origin}/api/integrations/google-sheets/oauth`,
    readOnly: true,
  })
}

export async function DELETE() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
  const result = await deleteGoogleWorkspaceConnection(user.id)
  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
