import type { FundingMode, RenderExecutor, RenderHost, RenderInput, RenderResult } from './types'

const REGISTRY = new Map<string, RenderExecutor>()

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

export async function runRender(
  host: RenderHost,
  actor: { userId: string },
  input: RenderInput,
  funding: FundingMode,
): Promise<RenderResult> {
  const log = host.log || consoleLog
  const executor = getRenderer(input.providerId)
  if (!executor) return { ok: false, code: 'no_executor', message: `No renderer registered for ${input.providerId}.` }

  const providerCostCents = Math.max(0, Math.ceil(executor.estimateCostCents(input)))
  const apiKey = funding.mode === 'byok' ? (funding.apiKey || null) : host.resolvePlatformKey(input.providerId)
  if (!apiKey) return { ok: false, code: 'no_key', message: 'No API key available for this provider.' }

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
      try { await host.wallet.refund(actor, reservationId) } catch { }
    }
    const message = err instanceof Error ? err.message : 'Provider render failed.'
    log.log('render.provider_failed', { providerId: input.providerId, message })
    return { ok: false, code: 'provider_failed', message }
  }
}
