// saas/app/api/hub/action/engine/route.ts
//
// Engine-backed action route — PARALLEL to /api/hub/action (which is untouched).
// Runs any provider+action that has a registered executor through the portable
// engine: validate → permission → execute → log.
//
// Accepts BOTH request shapes:
//   native : { providerId, actionId, input? }
//   legacy : { templateId: "provider.action", payload? }

import { NextRequest, NextResponse } from 'next/server'
import { runAction } from '@/console-core/actionEngine'
import { listRegistered } from '@/console-core/defaultHost'
import { createSignalBoostHost } from '@/console-host/signalboostHost'
import { isActionLive } from '@/lib/hub/console-catalog'

import '@/console-core/executors/openai'
import '@/console-core/executors/github'
import '@/console-core/executors/stripe'
import '@/console-core/executors/elevenlabs'
import '@/console-core/executors/anthropic'
import '@/console-core/executors/gemini'
import '@/console-core/executors/resend'
import '@/console-core/executors/improvmx'
import '@/console-core/executors/assemblyai'
import '@/console-core/executors/supabase-marketing'
import '@/console-core/executors/bank'
import '@/console-core/executors/social-outreach'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 })
    }

    let providerId: unknown = (body as any).providerId
    let actionId: unknown = (body as any).actionId
    let input: unknown = (body as any).input

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

    if (!isActionLive(`${providerId}.${actionId}`)) {
      return NextResponse.json({ ok: false, error: 'This action is not available yet.' }, { status: 501 })
    }

    const host = createSignalBoostHost(req)
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

export async function GET(req: NextRequest) {
  const host = createSignalBoostHost(req)
  const user = await host.auth.getCurrentUser()
  const roles = user?.roles || []
  if (!user || !(roles.includes('owner') || roles.includes('admin'))) {
    return NextResponse.json({ ok: false, error: 'Not authorized' }, { status: 403 })
  }
  return NextResponse.json({ registered: listRegistered() }, { status: 200 })
}
