import { getAdminSupabase } from '@/utils/supabase/server'
import { cosVideoRenderBucket } from '@/lib/cos/video-storage'
import { chargeForRender, refundRender } from '@/lib/credits/renderCredits'
import { randomUUID } from 'crypto'
import type {
  PaidProviderApprovalAdapter,
  PaidProviderApprovalRequest,
  PaidProviderApprovalResult,
  RenderActor,
  RenderHost,
  ReserveMeta,
  ReserveResult,
  StorageAdapter,
  WalletAdapter,
} from '@/render-core/types'

/**
 * Ceiling for self-serve auto-approval, in cents. A render at or under this
 * costs the platform little enough that an authenticated user spending their own
 * purchased credits is sufficient authorization. Anything above it still requires
 * an explicit owner approval reference passed by the caller.
 *
 * This is the safety valve: if a cost estimate is ever wrong by orders of
 * magnitude, the ceiling stops it rather than the bug billing the platform.
 */
const AUTO_APPROVAL_CEILING_CENTS = Math.max(0, Number(process.env.RENDER_AUTO_APPROVAL_CEILING_CENTS || 200))

/**
 * SignalBoost's server-side authorization for platform-funded renders.
 *
 * What it attests: the request reached the server with an authenticated actor,
 * for a known provider, at a cost the platform is willing to auto-authorize.
 * The credit reservation that follows immediately is what proves the user can
 * actually pay; this reference is what ties that charge to an authorization.
 *
 * It never calls a provider and never moves money.
 */
const approvalAdapter: PaidProviderApprovalAdapter = {
  async issue(request: PaidProviderApprovalRequest): Promise<PaidProviderApprovalResult> {
    if (!request.actor?.userId) {
      return { ok: false, reason: 'Sign in before starting a platform-funded render.' }
    }
    if (!Number.isFinite(request.providerCostCents) || request.providerCostCents <= 0) {
      return { ok: false, reason: 'This render has no valid cost estimate to authorize.' }
    }
    if (request.providerCostCents > AUTO_APPROVAL_CEILING_CENTS) {
      return {
        ok: false,
        reason: `This render costs ${request.providerCostCents} cents, above the ${AUTO_APPROVAL_CEILING_CENTS}-cent self-serve limit. It needs owner approval.`,
      }
    }
    return { ok: true, approvalId: `rnd_${request.providerId}_${Date.now()}_${randomUUID()}` }
  },
}

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
    approvals: approvalAdapter,
  }
}
