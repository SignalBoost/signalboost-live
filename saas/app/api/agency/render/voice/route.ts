// saas/app/api/agency/render/voice/route.ts
// Host edge for voiceover renders. Side-effect-imports the executor (self-registers),
// builds the SignalBoost host, and runs the portable engine. Wallet mode charges
// render credits BEFORE calling ElevenLabs; BYOK mode uses the user's own key and
// charges nothing. Auth required either way.

import { NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { runRender } from '@/render-core/engine'
import type { FundingMode } from '@/render-core/types'
import { createSignalBoostRenderHost } from '@/render-host/signalboostHost'
import '@/render-core/executors/elevenlabs-voice'
import { resolveUserProviderKey } from '@/lib/agency/userProviderKeys'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const access = await getAccess().catch(() => null)
  if (!access?.userId) return NextResponse.json({ ok: false, error: 'Sign in to generate voiceover.' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const text = String(body?.text || '').trim()
  const voiceId = String(body?.voiceId || '').trim()
  const useByok = body?.useByok === true

  if (!text) return NextResponse.json({ ok: false, error: 'Voiceover text is required.' }, { status: 400 })
  if (text.length > 5000) return NextResponse.json({ ok: false, error: 'Text exceeds the 5000-character limit.' }, { status: 400 })
  if (!voiceId) return NextResponse.json({ ok: false, error: 'Choose a voice.' }, { status: 400 })

  let funding: FundingMode
  if (useByok) {
    const key = await resolveUserProviderKey(access.userId, 'elevenlabs').catch(() => null)
    if (!key) return NextResponse.json({ ok: false, error: 'Connect your ElevenLabs key first, or use credits.' }, { status: 402 })
    funding = { mode: 'byok', apiKey: key }
  } else {
    funding = { mode: 'wallet' }
  }

  const host = createSignalBoostRenderHost()
  const result = await runRender(
    host,
    { userId: access.userId },
    { providerId: 'elevenlabs', kind: 'voice', params: { text, voiceId } },
    funding,
  )

  if (!result.ok) {
    const status = result.code === 'insufficient_funds' ? 402
      : result.code === 'daily_cap' ? 429
      : result.code === 'no_key' ? 402
      : 502
    return NextResponse.json({ ok: false, error: result.message, code: result.code }, { status })
  }

  return NextResponse.json({ ok: true, url: result.url, charged: result.charged, providerCostCents: result.providerCostCents })
}
