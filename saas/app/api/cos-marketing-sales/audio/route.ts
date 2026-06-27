import { NextResponse } from 'next/server'
import { buildPodcastSequence } from '@/lib/cos-marketing-sales'
import type { PodcastInput } from '@/lib/cos-marketing-sales'

export const dynamic = 'force-dynamic'

type Body = Partial<PodcastInput>

async function readBody(req: Request): Promise<Body> {
  try {
    const body = await req.json()
    return body && typeof body === 'object' ? body : {}
  } catch {
    return {}
  }
}

export async function POST(req: Request) {
  const body = await readBody(req)

  if (!body.rawText && !body.securityBrief) {
    return NextResponse.json({
      ok: false,
      errorKey: 'cos.error.rawTextOrSecurityBriefRequired',
    }, { status: 400 })
  }

  const sequence = buildPodcastSequence({
    title: body.title,
    rawText: body.rawText,
    securityBrief: body.securityBrief,
    locale: body.locale || 'en',
    platformName: body.platformName || 'SignalBoost',
    midRollOffer: body.midRollOffer,
  })

  return NextResponse.json({
    ok: true,
    module: 'cos_marketing_sales',
    route: 'audio',
    mode: 'mock_sequence_only_no_external_audio_call',
    sequence,
  })
}
