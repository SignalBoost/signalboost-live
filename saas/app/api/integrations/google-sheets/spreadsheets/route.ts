import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/utils/supabase/server.ts'
import {
  getGoogleSpreadsheetMetadata,
  listGoogleSpreadsheets,
  readGoogleSheetRange,
  searchGoogleSheetRows,
} from '@/lib/google-workspace/sheets.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function safeAccountFingerprint(emailAddress: string, permissionId: string): string {
  const identity = String(emailAddress || permissionId || '').trim().toLowerCase()
  return identity ? createHash('sha256').update(identity).digest('hex').slice(0, 12) : ''
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
  const query = String(req.nextUrl.searchParams.get('q') || '')
  const limit = Number(req.nextUrl.searchParams.get('limit') || 25)
  const result = await listGoogleSpreadsheets(user.id, { query, limit })
  if (result.ok) {
    console.info('[google-sheets-discovery]', {
      count: result.spreadsheets.length,
      mode: result.discoveryMode,
      accountFingerprint: result.account
        ? safeAccountFingerprint(result.account.emailAddress, result.account.permissionId)
        : '',
    })
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }) }
  const operation = String(body?.operation || '').trim()
  let result: any

  if (operation === 'metadata') {
    result = await getGoogleSpreadsheetMetadata(user.id, String(body?.spreadsheetId || ''))
  } else if (operation === 'read') {
    result = await readGoogleSheetRange(
      user.id,
      String(body?.spreadsheetId || ''),
      String(body?.range || ''),
      { maxRows: typeof body?.maxRows === 'number' ? body.maxRows : undefined },
    )
  } else if (operation === 'search') {
    result = await searchGoogleSheetRows(
      user.id,
      String(body?.spreadsheetId || ''),
      String(body?.range || ''),
      String(body?.query || ''),
      { limit: typeof body?.limit === 'number' ? body.limit : undefined },
    )
  } else {
    return NextResponse.json({ error: 'operation must be metadata, read, or search.' }, { status: 400 })
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}
