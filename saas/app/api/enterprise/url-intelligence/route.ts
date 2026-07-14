import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { buildEnterpriseIntelligence } from '@/lib/enterprise/intelligence/service'
import type { EnterpriseWorkspace } from '@/lib/enterprise/intelligence/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const WORKSPACES = new Set<EnterpriseWorkspace>(['cosa', 'campaign-studio', 'business', 'creator', 'podcast', 'store'])

export async function POST(request: Request) {
  const context = await requireAdmin()
  if (context instanceof NextResponse) return context

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  const sourceUrl = typeof (body as { sourceUrl?: unknown })?.sourceUrl === 'string'
    ? (body as { sourceUrl: string }).sourceUrl.trim()
    : ''
  const requestedWorkspace = (body as { workspace?: unknown })?.workspace
  const workspace: EnterpriseWorkspace = typeof requestedWorkspace === 'string' && WORKSPACES.has(requestedWorkspace as EnterpriseWorkspace)
    ? requestedWorkspace as EnterpriseWorkspace
    : 'campaign-studio'

  if (!sourceUrl) return NextResponse.json({ ok: false, error: 'sourceUrl is required.' }, { status: 400 })
  if (sourceUrl.length > 2_048) return NextResponse.json({ ok: false, error: 'sourceUrl is too long.' }, { status: 400 })

  try {
    const enterprise = await buildEnterpriseIntelligence({ sourceUrl, workspace })
    return NextResponse.json({ ok: true, result: enterprise.intelligence, enterprise })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'URL analysis failed.'
    const clientError = /required|supported|public|private|reserved|redirect|content type|HTTP 4|too long|exceeds/i.test(message)
    return NextResponse.json({ ok: false, error: message }, { status: clientError ? 400 : 502 })
  }
}
