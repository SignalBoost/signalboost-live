import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/permission-middleware'
import { buildProviderActionPreviewFromRequest } from '@/lib/hub/provider-action-preview-request'
import type { ProviderExecutionMode } from '@/lib/hub/provider-execution-modes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type PreviewRequestBody = {
  templateId?: string
  payload?: Record<string, unknown>
  mode?: ProviderExecutionMode
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req)
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: PreviewRequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON in request body' }, { status: 400 })
  }

  try {
    const result = buildProviderActionPreviewFromRequest({
      templateId: String(body.templateId || ''),
      payload: body.payload as Record<string, unknown>,
      mode: body.mode,
    })

    return NextResponse.json({
      ok: true,
      preview: result.preview,
      availableModes: result.policy.capabilities
        .filter(capability => capability.available)
        .map(capability => capability.mode),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'provider_preview_failed'
    const status = message === 'provider_template_not_found' ? 404 : 400
    return NextResponse.json({ ok: false, error: message }, { status })
  }
}
