import { NextResponse } from 'next/server'
import {
  createCosTelemetryEvent,
  toAzureEventHubEnvelope,
  toAzureMlFeatureRow,
  toCosmosTelemetryDocument,
  type CosTelemetryEventName,
  type CosTelemetrySource,
} from '@/lib/cos-marketing-sales'
import type { CosLocale } from '@/lib/cos-marketing-sales'

export const dynamic = 'force-dynamic'

type Body = {
  eventName?: CosTelemetryEventName
  eventSource?: CosTelemetrySource
  locale?: CosLocale
  identity?: Record<string, string | undefined>
  target?: { type?: string; id?: string; href?: string; labelKey?: string }
  payload?: Record<string, unknown>
}

async function readBody(req: Request): Promise<Body> {
  try {
    const body = await req.json()
    return body && typeof body === 'object' ? body : {}
  } catch {
    return {}
  }
}

const VALID_EVENTS: CosTelemetryEventName[] = [
  'ui.click',
  'ui.scroll_depth',
  'content.approved',
  'content.rejected',
  'lead.capture.created',
  'outreach.plan.created',
  'outreach.domain_throttle.blocked',
  'audio.sequence.created',
  'print.payload.compiled',
]

const VALID_SOURCES: CosTelemetrySource[] = [
  'public_window_nav',
  'public_product_page',
  'lead_intake',
  'dashboard',
  'admin_console',
  'api_route',
  'worker',
]

export async function POST(req: Request) {
  const body = await readBody(req)

  if (!body.eventName || !VALID_EVENTS.includes(body.eventName)) {
    return NextResponse.json({ ok: false, errorKey: 'cos.error.telemetryEventNameRequired' }, { status: 400 })
  }

  if (!body.eventSource || !VALID_SOURCES.includes(body.eventSource)) {
    return NextResponse.json({ ok: false, errorKey: 'cos.error.telemetryEventSourceRequired' }, { status: 400 })
  }

  const event = createCosTelemetryEvent({
    eventName: body.eventName,
    eventSource: body.eventSource,
    locale: body.locale,
    identity: body.identity || {},
    target: body.target,
    payload: body.payload || {},
  })

  return NextResponse.json({
    ok: true,
    module: 'cos_marketing_sales',
    route: 'telemetry',
    mode: 'ingestion_stub_no_external_stream',
    event,
    azureEventHub: toAzureEventHubEnvelope(event),
    cosmosDocument: toCosmosTelemetryDocument(event),
    azureMlFeatureRow: toAzureMlFeatureRow(event),
  })
}
