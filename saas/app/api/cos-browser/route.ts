import { NextRequest } from 'next/server'
import { POST as cosPrimaryPost } from '@/app/api/cos-primary/route'
import { evaluateRunpodWakePermission } from '@/lib/ai/cos/runpodWakePermission'
import { withRunpodWakePermission } from '@/lib/ai/local-inference'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Browser-only ingress wrapper for COS Primary.
 *
 * RunPod wake permission must be established at the actual browser request boundary. The stable
 * /api/concierge endpoint is rewritten here by proxy.ts, then the complete COS Primary execution —
 * including local reasoning, embeddings, Council when appropriate, and governed fallback — runs
 * inside this request-scoped permission.
 *
 * Direct/server calls to /api/cos-primary do NOT pass through this wrapper and therefore cannot
 * start a stopped RunPod. They may use the reasoner only when it is already healthy/running.
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

  console.info('[cos-browser-runpod-wake-permission]', JSON.stringify({
    at: new Date().toISOString(),
    allowed: permission.allowed,
    source: permission.source,
    interactionId: permission.interactionId,
    ageMs: permission.ageMs,
    reason: permission.reason,
  }))

  return withRunpodWakePermission(permission, () => cosPrimaryPost(req))
}
