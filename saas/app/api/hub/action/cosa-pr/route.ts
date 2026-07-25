import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/permission-middleware'
import { buildProviderActionPreviewFromRequest } from '@/lib/hub/provider-action-preview-request'
import { createProviderExecutionPolicy } from '@/lib/hub/provider-execution-modes'
import { stageInfrastructurePR, type InfraRisk } from '@/lib/hub/pr-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type CosaPrRequestBody = {
  templateId?: string
  payload?: Record<string, unknown>
  title?: string
  summary?: string
  risk?: InfraRisk
}

const COSA_PR_POLICY = createProviderExecutionPolicy({
  preferredMode: 'cosa_pr',
  capabilities: [{
    mode: 'cosa_pr',
    available: true,
    endpoint: '/api/hub/action/cosa-pr',
  }],
})

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req)
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: CosaPrRequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON in request body' }, { status: 400 })
  }

  try {
    const templateId = String(body.templateId || '')
    const payload = body.payload as Record<string, unknown>
    const previewResult = buildProviderActionPreviewFromRequest({
      templateId,
      payload,
      mode: 'cosa_pr',
      policy: COSA_PR_POLICY,
    })

    const preview = previewResult.preview
    const staged = await stageInfrastructurePR({
      title: String(body.title || `${preview.provider}: ${preview.templateId}`),
      summary: String(body.summary || `Governed AI infrastructure proposal for ${preview.modeLabel}. Expected verification: ${preview.expectedVerification}`),
      risk: body.risk,
      createdBy: user.id,
      createdByEmail: user.email,
      steps: [{
        provider: preview.provider,
        templateId: preview.templateId,
        label: `${preview.modeLabel}: ${preview.templateId}`,
        payload: preview.payload as Record<string, unknown>,
      }],
    })

    if (!staged.ok || !staged.pr) {
      return NextResponse.json({ ok: false, error: staged.error || 'cosa_pr_stage_failed' }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      duplicate: Boolean(staged.duplicate),
      proposal: {
        id: staged.pr.id,
        title: staged.pr.title,
        status: staged.pr.status,
        risk: staged.pr.risk,
        createdAt: staged.pr.created_at,
      },
      preview,
      executesProviderMutation: false,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'cosa_pr_stage_failed'
    const status = message === 'provider_template_not_found' ? 404 : 400
    return NextResponse.json({ ok: false, error: message }, { status })
  }
}
