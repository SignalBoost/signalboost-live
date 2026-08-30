import { NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { createSupabaseBuilderWorkspace } from '@/lib/builder/workspace-supabase'
import { decodeBuilderImageArtifact } from '@/lib/builder/image-artifact'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Downloads a file only after the authenticated owner has been verified server-side. */
export async function GET(request: Request, context: { params: Promise<{ workspaceId: string; path: string[] }> }) {
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
    const isPdf = name.toLowerCase().endsWith('.pdf') && file.content.startsWith('artifact-pdf-base64:')
    const imageArtifact = decodeBuilderImageArtifact(file.content)
    const previewRequested = new URL(request.url).searchParams.get('preview') === '1'
    const isImagePreview = previewRequested && Boolean(imageArtifact)
    const isHtmlPreview = previewRequested && /\.html?$/i.test(name)
    const body = isPdf
      ? Buffer.from(file.content.slice('artifact-pdf-base64:'.length), 'base64')
      : imageArtifact
        ? imageArtifact.bytes
        : file.content
    return new NextResponse(body, {
      headers: {
        'Content-Type': isPdf ? 'application/pdf' : imageArtifact ? imageArtifact.mime : isHtmlPreview ? 'text/html; charset=utf-8' : 'application/octet-stream; charset=utf-8',
        'Content-Disposition': `${isHtmlPreview || isImagePreview ? 'inline' : 'attachment'}; filename="${name.replace(/["\r\n]/g, '_')}"`,
        // Previewed user HTML is isolated: no scripts, forms, frames, network connections, or parent access.
        ...(isHtmlPreview ? { 'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src https: data:" } : {}),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return NextResponse.json({ error: 'File not found.' }, { status: 404 })
  }
}
