// Request-scoped RunPod wake boundary for COS Primary.
// The complete COS Primary implementation remains in routeCore.ts; this wrapper only derives the
// same fresh same-origin interaction permission used by /api/support and scopes the whole request.

import { NextRequest } from 'next/server'
import { evaluateRunpodWakePermission } from '@/lib/ai/cos/runpodWakePermission'
import { withRunpodWakePermission } from '@/lib/ai/local-inference'
import { POST as corePOST } from './routeCore.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const body = await req.clone().json().catch(() => ({}))
  const wakePermission = evaluateRunpodWakePermission({
    body,
    interactionHeader: req.headers.get('x-signalboost-user-interaction'),
    requestOrigin: req.headers.get('origin'),
    expectedOrigin: req.nextUrl.origin,
    secFetchSite: req.headers.get('sec-fetch-site'),
  })

  console.info('[cos-runpod-wake-permission]', JSON.stringify({
    at: new Date().toISOString(),
    route: 'cos-primary',
    allowed: wakePermission.allowed,
    source: wakePermission.source,
    interactionId: wakePermission.interactionId,
    ageMs: wakePermission.ageMs,
    reason: wakePermission.reason,
  }))

  return withRunpodWakePermission(wakePermission, () => corePOST(new NextRequest(req.clone())))
}
