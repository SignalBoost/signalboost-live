import { NextRequest } from 'next/server'
import { POST as cosPrimaryPost } from '@/app/api/cos-primary/route'
import { evaluateRunpodWakePermission } from '@/lib/ai/cos/runpodWakePermission'
import { withRunpodWakePermission } from '@/lib/ai/local-inference'
import { getAccess } from '@/lib/auth/access'
import { withPublicAuditIdentity } from '@/lib/auth/publicAuditIdentity'
import { withPublicDeliveryScope } from '@/lib/auth/publicDeliveryScope'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Browser-only ingress wrapper for COS Primary.
 *
 * The stable /api/concierge endpoint is rewritten here by proxy.ts. This is therefore the REAL
 * public Concierge request boundary and must establish BOTH:
 *   1) request-scoped RunPod wake permission; and
 *   2) request-scoped public-delivery isolation.
 *
 * Public delivery isolation is applied before COS Primary performs auth, freshness routing,
 * reasoning, fallback, or persistence. Even if the browser belongs to the owner, nested access
 * checks see guest/public authority and COS cannot inherit owner/admin/private-company context.
 *
 * A separately captured request-local audit identity carries only the authenticated user id into
 * provenance persistence. It is not authorization context and is never exposed to COS reasoning,
 * private memory, tools, or prompts.
 *
 * Direct/server calls to /api/cos-primary do NOT pass through this wrapper and therefore are not
 * public Concierge traffic; they also cannot start a stopped RunPod unless separately authorized.
 */
export async function POST(req: NextRequest) {
  const body = await req.clone().json().catch(() => ({}))
  const permission = evaluateRunpodWakePermission({
    body,
    interactionHeader: req.headers.get('x-signalboost-user-interaction'),
    requestOrigin: req.headers.get('origin'),
    expectedOrigin: req.nextUrl.origin,
    secFetchSite: req.headers.get('sec-fetch-site'),
  })

  // Capture correlation identity BEFORE entering public-delivery scope. Only the user id is carried
  // forward. Once publicDeliveryScope starts, getAccess() still resolves to guest by design.
  const auditUserId = (await getAccess().catch(() => null))?.userId ?? null

  console.info('[cos-browser-runpod-wake-permission]', JSON.stringify({
    at: new Date().toISOString(),
    allowed: permission.allowed,
    source: permission.source,
    interactionId: permission.interactionId,
    ageMs: permission.ageMs,
    reason: permission.reason,
    auditIdentityCaptured: Boolean(auditUserId),
  }))

  return withPublicAuditIdentity(auditUserId, () =>
    withPublicDeliveryScope(() =>
      withRunpodWakePermission(permission, () => cosPrimaryPost(req)),
    ),
  )
}
