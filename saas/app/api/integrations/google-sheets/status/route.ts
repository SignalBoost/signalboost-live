import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/utils/supabase/server.ts'
import { googleWorkspaceOAuthConfigured } from '@/lib/google-workspace/oauth.ts'
import { getGoogleDriveAccount } from '@/lib/google-workspace/sheets.ts'
import {
  deleteGoogleWorkspaceConnection,
  getGoogleWorkspaceConnectionStatus,
} from '@/lib/google-workspace/token-store.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function safeAccountFingerprint(emailAddress: string, permissionId: string): string {
  const identity = String(emailAddress || permissionId || '').trim().toLowerCase()
  return identity ? createHash('sha256').update(identity).digest('hex').slice(0, 12) : ''
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
  const connection = await getGoogleWorkspaceConnectionStatus(user.id)

  let googleAccount = null
  if (connection.connected) {
    const accountResult = await getGoogleDriveAccount(user.id)
    if (!('reason' in accountResult)) {
      googleAccount = accountResult.account
      console.info('[google-sheets-account]', {
        fingerprint: safeAccountFingerprint(accountResult.account.emailAddress, accountResult.account.permissionId),
        hasEmail: Boolean(accountResult.account.emailAddress),
      })
    }
  }

  return NextResponse.json({
    ok: true,
    configured: googleWorkspaceOAuthConfigured(),
    connection,
    googleAccount,
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
