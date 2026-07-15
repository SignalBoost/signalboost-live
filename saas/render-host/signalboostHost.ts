// saas/render-host/signalboostHost.ts
//
// SignalBoost's host layer for the portable render engine. This is the ONLY place
// render-core meets SignalBoost-specific systems: the render-credit wallet and
// Supabase storage. A different buyer would replace THIS file (and keep render-core
// untouched) to drop the module into their stack.

import { getAdminSupabase } from '@/utils/supabase/server'
import { cosVideoRenderBucket } from '@/lib/cos/video-storage'
import { chargeForRender, refundRender } from '@/lib/credits/renderCredits'
import type {
  RenderActor,
  RenderHost,
  ReserveMeta,
  ReserveResult,
  StorageAdapter,
  WalletAdapter,
} from '@/render-core/types'

const walletAdapter: WalletAdapter = {
  async reserve(actor: RenderActor, providerCostCents: number, meta: ReserveMeta): Promise<ReserveResult> {
    const result = await chargeForRender({
      userId: actor.userId,
      provider: meta.providerId,
      providerCostCents,
      action: meta.kind,
      reference: meta.reference || '',
    })
    if (result.ok) return { ok: true, reservationId: result.ledgerId }
    const r = result as { code?: string; message?: string }
    if (r.code === 'insufficient_credits') return { ok: false, code: 'insufficient_funds', message: r.message || 'Insufficient credits.' }
    if (r.code === 'daily_cap') return { ok: false, code: 'daily_cap', message: r.message || 'Daily limit reached.' }
    return { ok: false, code: 'error', message: r.message || 'Could not reserve credits.' }
  },
  async refund(actor: RenderActor, reservationId: string): Promise<void> {
    await refundRender(actor.userId, reservationId)
  },
}

const storageAdapter: StorageAdapter = {
  async persist(bytes: ArrayBuffer, contentType: string, keyHint: string): Promise<{ url: string }> {
    const admin = getAdminSupabase()
    const bucket = cosVideoRenderBucket()
    const ext = contentType.includes('audio') ? 'mp3' : contentType.includes('video') ? 'mp4' : 'bin'
    const objectPath = `renders/${keyHint.replace(/[^a-zA-Z0-9/_-]/g, '_')}.${ext}`
    const up = await admin.storage.from(bucket).upload(objectPath, bytes, { contentType, upsert: true })
    if (up.error) throw new Error(`Storage upload failed: ${up.error.message}`)
    const signed = await admin.storage.from(bucket).createSignedUrl(objectPath, 60 * 60 * 24 * 7)
    if (signed.error || !signed.data?.signedUrl) throw new Error('Could not sign render URL.')
    return { url: signed.data.signedUrl }
  },
}

function resolvePlatformKey(providerId: string): string | null {
  if (providerId === 'elevenlabs') return process.env.ELEVENLABS_API_KEY || null
  return null
}

export function createSignalBoostRenderHost(): RenderHost {
  return {
    wallet: walletAdapter,
    storage: storageAdapter,
    log: { log: (event, data) => console.log(`[render] ${event}`, data) },
    resolvePlatformKey,
  }
}
