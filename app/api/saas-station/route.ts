import { NextResponse } from 'next/server'
import { runSaasStationPipeline } from '@/lib/saasStation/pipeline'
import { getSaasStationModule } from '@/lib/saasStation/modules'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const module = typeof body.module === 'string' ? body.module : 'assistant'
  const result = runSaasStationPipeline({
    module,
    text: typeof body.text === 'string' ? body.text : '',
    locale: typeof body.locale === 'string' ? body.locale : 'en',
    subscriptionTier: typeof body.subscriptionTier === 'string' ? body.subscriptionTier : 'free',
    usage: Number.isFinite(Number(body.usage)) ? Number(body.usage) : 0,
    quota: Number.isFinite(Number(body.quota)) ? Number(body.quota) : undefined,
    userId: typeof body.userId === 'string' ? body.userId : 'anonymous',
    billingProvider: body.billingProvider === 'stripe' || body.billingProvider === 'paypal' || body.billingProvider === 'internal' ? body.billingProvider : undefined,
  })

  return NextResponse.json(result)
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const module = getSaasStationModule(url.searchParams.get('module') ?? 'assistant')?.key ?? 'assistant'
  return NextResponse.json(runSaasStationPipeline({
    module,
    text: url.searchParams.get('text') ?? undefined,
    locale: url.searchParams.get('locale') ?? 'en',
    subscriptionTier: url.searchParams.get('subscriptionTier') ?? 'free',
    usage: Number(url.searchParams.get('usage') ?? 0),
    quota: url.searchParams.has('quota') ? Number(url.searchParams.get('quota')) : undefined,
    userId: url.searchParams.get('userId') ?? 'anonymous',
  }))
}
