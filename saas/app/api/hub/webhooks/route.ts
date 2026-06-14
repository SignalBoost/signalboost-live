// saas/app/api/hub/webhooks/route.ts
import { NextRequest, NextResponse } from 'next/server'
import {
  listWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  testWebhook,
} from '@/lib/hub/webhooks-service'
import { requirePermission } from '@/lib/auth/permission-middleware'

type WebhookRequest = {
  url: string
  events: string[]
  active: boolean
  retryPolicy: {
    maxRetries: number
    delayMs: number
  }
}

export async function GET(req: NextRequest) {
  const perm = await requirePermission(req, 'webhooks:read')
  if (!perm.ok) {
    return NextResponse.json(
      { ok: false, error: (perm as any).error },
      { status: (perm as any).status }
    )
  }

  try {
    const result = await listWebhooks()
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const perm = await requirePermission(req, 'webhooks:write')
  if (!perm.ok) {
    return NextResponse.json(
      { ok: false, error: (perm as any).error },
      { status: (perm as any).status }
    )
  }

  try {
    const body: WebhookRequest = await req.json()

    // Validate URL
    try {
      new URL(body.url)
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Invalid webhook URL' },
        { status: 400 }
      )
    }

    // Validate events
    if (!body.events || body.events.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'At least one event required' },
        { status: 400 }
      )
    }

    const result = await createWebhook(body)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const perm = await requirePermission(req, 'webhooks:write')
  if (!perm.ok) {
    return NextResponse.json(
      { ok: false, error: (perm as any).error },
      { status: (perm as any).status }
    )
  }

  try {
    const id = req.nextUrl.searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { ok: false, error: 'Webhook ID required' },
        { status: 400 }
      )
    }

    const result = await deleteWebhook(id)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
