import { NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { createSupabaseBuilderWorkspace } from '@/lib/builder/workspace-supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Downloads a file only after the authenticated owner has been verified server-side. */
export async function GET(_: Request, context: { params: Promise<{ workspaceId: string; path: string[] }> }) {
  const access = await getAccess().catch(() => null)
  if (!access?.userId) return NextResponse.json({ error: 'Sign in to download Builder files.' }, { status: 401 })
  const { workspaceId, path } = await context.params
  if (!UUID.test(workspaceId)) return NextResponse.json({ error: 'Invalid workspace id.' }, { status: 400 })
  const workspace = createSupabaseBuilderWorkspace(access.userId)
  if (!workspace) return NextResponse.json({ error: 'Builder storage is unavailable.' }, { status: 503 })
  try {
    const file = await workspace.readFile(workspaceId, path.join('/'))
    if (!file) return NextResponse.json({ error: 'File not found.' }, { status: 404 })
    const name = file.path.split('/').pop() || 'download.txt'
    return new NextResponse(file.content, {
      headers: {
        'Content-Type': 'application/octet-stream; charset=utf-8',
        'Content-Disposition': \`attachment; filename="\${name.replace(/["\\r\\n]/g, '_')}"\`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch {
    return NextResponse.json({ error: 'File not found.' }, { status: 404 })
  }
}