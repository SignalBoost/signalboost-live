// saas/app/api/hub/action/engine/route.ts
//
// Engine-backed action route — PARALLEL to /api/hub/action (which is untouched).
// Runs any provider+action that has a registered executor through the portable
// engine: validate → permission → execute → log. As providers migrate to
// executors, they move from the legacy route to this one with no UI change.
//
// POST body: { providerId, actionId, input? }

import { NextRequest, NextResponse } from 'next/server'
import { runAction } from '@/console-core/actionEngine'
import { createDefaultHost, listRegistered } from '@/console-core/defaultHost'

// Side-effect imports: each registers its provider's executors at module load.
import '@/console-core/executors/openai'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body.providerId !== 'string' || typeof body.actionId !== 'string') {
      return NextResponse.json({ ok: false, error: 'providerId and actionId are required' }, { status: 400 })
    }
    const host = createDefaultHost(req)
    const result = await runAction(host, {
      providerId: body.providerId,
      actionId: body.actionId,
      input: (body.input && typeof body.input === 'object') ? body.input : {},
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
