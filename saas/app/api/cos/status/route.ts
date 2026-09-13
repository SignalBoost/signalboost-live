// saas/app/api/cos/status/route.ts
// COS lifeline / recognition probe. Reports the brain the caller is actually getting without
// treating any hosted-model credential as a prerequisite for COS.
//   mode = 'cos'       -> recognized owner + independent COS reasoner healthy
//   mode = 'degraded'  -> recognized owner but independent reasoner unavailable/unhealthy
//   mode = 'concierge' -> not recognized as owner (check OWNER_EMAILS)
// Hosted-model fallback is optional and separately governed by COS_EXTERNAL_AI_FALLBACK_ENABLED.
import { NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { externalFallbackEnabled, independentReasonerHealth } from '@/lib/ai/cos/cosOrchestration'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  let isOwner = false
  try { const a = await getAccess(); isOwner = a.isOwner } catch { isOwner = false }

  // Public callers only need to know which delivery surface they are receiving. Do not disclose
  // the private reasoner model, endpoint health, or fallback policy to an unprivileged session.
  if (!isOwner) {
    return NextResponse.json({
      ok: true,
      mode: 'concierge',
      isOwner: false,
      detail: 'Not recognized as owner — you are getting the customer Concierge, not the private COS.',
    })
  }

  const reasoner = await independentReasonerHealth().catch(error => ({
    configured: false,
    healthy: false,
    model: null,
    error: error instanceof Error ? error.message : String(error),
  }))
  const cloudFallbackEnabled = externalFallbackEnabled()

  const mode: 'cos' | 'degraded' = reasoner.configured && reasoner.healthy ? 'cos' : 'degraded'
  const detail = mode === 'cos'
    ? `Full Chief of Staff active — owner recognized and independent COS reasoner healthy${reasoner.model ? ` (${reasoner.model})` : ''}. Hosted-model fallback is ${cloudFallbackEnabled ? 'explicitly enabled' : 'disabled'}.`
    : reasoner.configured
      ? `Owner recognized, but the independent COS reasoner is unhealthy${reasoner.error ? `: ${reasoner.error}` : '.'}`
      : 'Owner recognized, but the independent COS reasoner is not configured. Check LOCAL_AI_BASE_URL, LOCAL_AI_MODEL, LOCAL_AI_API_KEY, and LOCAL_AI_ALLOWED_HOSTS.'

  return NextResponse.json({
    ok: true,
    mode,
    isOwner: true,
    detail,
    localReasoner: reasoner,
    cloudFallbackEnabled,
    providerIndependent: reasoner.configured && reasoner.healthy && !cloudFallbackEnabled,
  })
}
