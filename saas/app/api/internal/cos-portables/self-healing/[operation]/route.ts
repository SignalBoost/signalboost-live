import { NextRequest, NextResponse } from 'next/server'
import { createSelfHealingSupervisorPortableRuntime } from '@/lib/portable-products/cos-runtimes/selfHealingSupervisor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorized(req: NextRequest): boolean {
  const secret = process.env.COS_PORTABLE_BRIDGE_SECRET || process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  return Boolean(secret && auth === `Bearer ${secret}`)
}

async function parseBody(req: NextRequest): Promise<any> {
  try { return await req.json() } catch { return {} }
}

async function handle(req: NextRequest, context: { params: Promise<{ operation: string }> }) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const { operation } = await context.params
  const runtime = createSelfHealingSupervisorPortableRuntime()
  try {
    if (operation === 'manifest') return NextResponse.json(await runtime.getManifest())
    const body = await parseBody(req)
    if (operation === 'observe') return NextResponse.json(await runtime.observe({ objective: String(body?.objective || '') }))
    if (operation === 'invoke') return NextResponse.json(await runtime.invoke({ objective: String(body?.objective || ''), action: body?.action }))
    if (operation === 'verify') return NextResponse.json(await runtime.verify(body))
    if (operation === 'recover') {
      if (!runtime.recover) return NextResponse.json({ status: 'not_available', summary: 'Recovery is not exposed by this portable.' })
      return NextResponse.json(await runtime.recover(body))
    }
    return NextResponse.json({ ok: false, error: 'Unknown portable operation.' }, { status: 404 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'portable_operation_failed' }, { status: 500 })
  }
}

export async function GET(req: NextRequest, context: { params: Promise<{ operation: string }> }) { return handle(req, context) }
export async function POST(req: NextRequest, context: { params: Promise<{ operation: string }> }) { return handle(req, context) }
