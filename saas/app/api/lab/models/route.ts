// Public model directory suggestions for the currently supported training adapter.
// Directory results are NOT evidence that a model is licensable, trainable or compatible.
import { NextRequest, NextResponse } from 'next/server'
import { customerSession } from '@/lib/lab/customerSession'
import { LAB_PROVIDER_CATALOG } from '@/lib/ai/cos/labCustomerProviderCatalog'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await customerSession()
  if (!session) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const kind = req.nextUrl.searchParams.get('provider') || ''
  const provider = LAB_PROVIDER_CATALOG.find(item => item.kind === kind && item.supports['training.execute'])
  if (!provider) return NextResponse.json({ ok: false, error: 'lab_training_provider_unsupported' }, { status: 400 })
  if (kind !== 'huggingface') return NextResponse.json({ ok: true, models: [] }, { headers: { 'cache-control': 'no-store' } })
  try {
    const response = await fetch('https://huggingface.co/api/models?pipeline_tag=text-generation&sort=downloads&direction=-1&limit=30', {
      signal: AbortSignal.timeout(6000),
      headers: { accept: 'application/json' },
      cache: 'no-store',
      redirect: 'error',
    })
    if (!response.ok) throw new Error('model_directory_unavailable')
    const rows: unknown = await response.json()
    const models = Array.isArray(rows)
      ? Array.from(new Set(rows.map((m: { id?: unknown }) => m?.id).filter((id): id is string =>
          typeof id === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(id)))).slice(0, 30)
      : []
    return NextResponse.json({ ok: true, models }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    // Users can still choose a compatible model ID manually when discovery is down.
    return NextResponse.json({ ok: true, models: [] }, { headers: { 'cache-control': 'no-store' } })
  }
}
