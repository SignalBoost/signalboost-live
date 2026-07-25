import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/permission-middleware'
import { buildBrowserAgentDryRunPackage } from '@/lib/hub/browser-agent-dry-run'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type DryRunRequestBody = {
  templateId?: string
  payload?: Record<string, unknown>
  adapterId?: string
  approvedOrigin?: string
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req)
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: DryRunRequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON in request body' }, { status: 400 })
  }

  try {
    const dryRun = buildBrowserAgentDryRunPackage({
      templateId: String(body.templateId || ''),
      payload: body.payload as Record<string, unknown>,
      adapterId: String(body.adapterId || ''),
      approvedOrigin: String(body.approvedOrigin || ''),
    })

    return NextResponse.json({ ok: true, dryRun })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'browser_agent_dry_run_failed'
    const status = message === 'provider_template_not_found' ? 404 : 400
    return NextResponse.json({ ok: false, error: message }, { status })
  }
}
