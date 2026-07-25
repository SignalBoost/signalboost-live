import { NextRequest, NextResponse } from 'next/server'

import { getCurrentUser } from '@/lib/auth/permission-middleware'
import { getProviderExecutionPolicy, getReviewedProviderExecutionCapability } from '@/lib/hub/provider-execution-capability-registry'
import { getTemplate } from '@/lib/hub/provider-templates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type CapabilityRequestBody = {
  templateId?: string
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req)
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: CapabilityRequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON in request body' }, { status: 400 })
  }

  const templateId = String(body.templateId || '').trim()
  if (!templateId) {
    return NextResponse.json({ ok: false, error: 'template_id_required' }, { status: 400 })
  }

  if (!getTemplate(templateId)) {
    return NextResponse.json({ ok: false, error: 'provider_template_not_found' }, { status: 404 })
  }

  const policy = getProviderExecutionPolicy(templateId)
  const reviewed = getReviewedProviderExecutionCapability(templateId)

  return NextResponse.json({
    ok: true,
    templateId,
    preferredMode: policy.preferredMode,
    capabilities: policy.capabilities.map(capability => ({
      mode: capability.mode,
      available: capability.available,
      reason: capability.reason,
      endpoint: capability.endpoint,
      browserAdapterId: capability.browserAdapterId,
      approvedOrigin: capability.approvedOrigin,
    })),
    review: reviewed
      ? { reviewer: reviewed.reviewer, reviewedAt: reviewed.reviewedAt }
      : null,
    executionBoundary: {
      directMayMutateProvider: true,
      cosaPrStagesProposalOnly: true,
      browserAgentCreatesDryRunOnly: true,
      directConfigurationHasNoProviderEndpoint: true,
    },
  })
}
