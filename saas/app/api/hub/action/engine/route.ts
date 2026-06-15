// saas/app/api/hub/action/engine/route.ts
//
// Engine-backed action route — PARALLEL to /api/hub/action (which is untouched).
// Runs any provider+action that has a registered executor through the portable
// engine: validate → permission → execute → log.
//
// Accepts BOTH request shapes:
//   native : { providerId, actionId, input? }
//   legacy : { templateId: "provider.action", payload? }   ← so the existing form
//            can target this route with only a URL change, no body change.

import { NextRequest, NextResponse } from 'next/server'
import { runAction } from '@/console-core/actionEngine'
import { createDefaultHost, listRegistered } from '@/console-core/defaultHost'

// Side-effect imports: each registers its provider's executors at module load.
import '@/console-core/executors/openai'
import '@/console-core/executors/github'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 })
    }

    let providerId: unknown = (body as any).providerId
    let actionId: unknown = (body as any).actionId
    let input: unknown = (body as any).input

    // Legacy-shape alias: split "provider.action" → providerId + actionId.
    if ((typeof providerId !== 'string' || typeof actionId !== 'string') && typeof (body as any).templateId === 'string') {
      const tid = String((body as any).templateId)
      const dot = tid.indexOf('.')
      if (dot > 0) {
        providerId = tid.slice(0, dot)
        actionId = tid.slice(dot + 1)
      }
      if (input === undefined) input = (body as any).payload
    }

    if (typeof providerId !== 'string' || typeof actionId !== 'string') {
      return NextResponse.json({ ok: false, error: 'providerId and actionId (or templateId) are required' }, { status: 400 })
    }

    const host = createDefaultHost(req)
    const result = await runAction(host, {
      providerId,
      actionId,
      input: (input && typeof input === 'object') ? (input as Record<string, unknown>) : {},
    })
    const { status, ...rest } = result
    return NextResponse.json(rest, { status: status || (rest.ok ? 200 : 400) })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Engine error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

// GET → which executors are wired (handy while migrating providers).
export async function GET() {
  return NextResponse.json({ registered: listRegistered() }, { status: 200 })
}
