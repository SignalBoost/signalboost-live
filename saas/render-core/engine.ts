// saas/render-core/engine.ts
//
// Portable render registry + engine. Providers self-register via registerRenderer.
// The engine runs the fixed pipeline and never spends before funds are reserved
// (collect-before-spend). Host-agnostic: everything host-specific arrives through
// the injected RenderHost adapters.

import type {
  FundingMode,
  RenderExecutor,
  RenderHost,
  RenderInput,
  RenderResult,
} from './types'

const REGISTRY = new Map<string, RenderExecutor>()

/** Called at module load by each executor file. */
export function registerRenderer(executor: RenderExecutor): void {
  REGISTRY.set(executor.providerId, executor)
}

export function getRenderer(providerId: string): RenderExecutor | undefined {
  return REGISTRY.get(providerId)
}

export function listRenderers(): { providerId: string; kind: string }[] {
  return Array.from(REGISTRY.values()).map((e) => ({ providerId: e.providerId, kind: e.kind }))
}

const consoleLog = { log: (event: string, data: Record<string, unknown>) => { void event; void data } }

/**
 * Run one render end to end.
 *
 * Wallet mode: estimate cost -> reserve (atomic, refuses overspend/daily cap) ->
 *   produce -> persist -> return. On production failure, refund the reservation.
 * BYOK mode: no reservation, no host charge; user's key funds the provider.
 *
 * The engine NEVER calls the provider before a successful reservation in wallet
 * mode — this is the collect-before-spend guarantee.
 */
export async function runRender(
  host: RenderHost,
  actor: { userId: string },
  input: RenderInput,
  funding: FundingMode,
): Promise<RenderResult> {
  const log = host.log || consoleLog
  const executor = getRenderer(input.providerId)
  if (!executor) {
    return { ok: false, code: 'no_executor', message: `No renderer registered for ${input.providerId}.` }
  }

  const providerCostCents = Math.max(0, Math.ceil(executor.estimateCostCents(input)))

  let apiKey: string | null
  if (funding.mode === 'byok') {
    apiKey = funding.apiKey || null
  } else {
    apiKey = host.resolvePlatformKey(input.providerId)
  }
  if (!apiKey) {
    return { ok: false, code: 'no_key', message: 'No API key available for this provider.' }
  }

  let reservationId: string | null = null
  let charged = false
  if (funding.mode === 'wallet') {
    const reservation = await host.wallet.reserve(actor, providerCostCents, {
      providerId: input.providerId,
      kind: input.kind,
    })
    if (!reservation.ok) {
      log.log('render.reserve_failed', { providerId: input.providerId, code: reservation.code })
      return { ok: false, code: reservation.code, message: reservation.message }
    }
    reservationId = reservation.reservationId || null
    charged = true
  }

  try {
    const produced = await executor.produce(input, apiKey)
    const keyHint = `${input.providerId}/${input.kind}/${Date.now()}`
    const persisted = await host.storage.persist(produced.bytes, produced.contentType, keyHint)
    log.log('render.ok', { providerId: input.providerId, units: produced.units, providerCostCents, charged })
    return { ok: true, url: persisted.url, providerCostCents, charged }
  } catch (err) {
    if (funding.mode === 'wallet' && reservationId) {
      try { await host.wallet.refund(actor, reservationId) } catch { /* refund best-effort */ }
    }
    const message = err instanceof Error ? err.message : 'Provider render failed.'
    log.log('render.provider_failed', { providerId: input.providerId, message })
    return { ok: false, code: 'provider_failed', message }
  }
}
