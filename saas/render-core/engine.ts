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

  // The paid-provider gate. Platform money may not leave without a server-side
  // approval reference. The caller can supply one (an explicit owner approval);
  // otherwise the host's issuer may mint one under its own funding policy.
  //
  // Fail closed at every branch: no issuer, a refusing issuer, a throwing issuer,
  // and a malformed approval id all block the render before any key is resolved,
  // any credit is reserved, and any provider is called.
  let paidProviderApprovalId = String(input.paidProviderApprovalId || '').trim() || null
  if (funding.mode === 'wallet' && providerCostCents > 0 && !paidProviderApprovalId) {
    if (!host.approvals) {
      log.log('render.approval_required', { providerId: input.providerId, providerCostCents, reason: 'no_issuer' })
      return { ok: false, code: 'approval_required', message: 'Paid provider renders require server-side payment confirmation and owner approval.' }
    }
    let issued: { ok: boolean; approvalId?: string; reason?: string }
    try {
      issued = await host.approvals.issue({ actor, providerId: input.providerId, kind: input.kind, providerCostCents })
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'approval issuer failed'
      log.log('render.approval_required', { providerId: input.providerId, providerCostCents, reason })
      return { ok: false, code: 'approval_required', message: 'Payment authorization could not be confirmed for this render.' }
    }
    const approvalId = issued.ok ? String(issued.approvalId || '').trim() : ''
    if (!issued.ok || !approvalId) {
      log.log('render.approval_required', { providerId: input.providerId, providerCostCents, reason: issued.reason || 'refused' })
      return { ok: false, code: 'approval_required', message: issued.reason || 'This render was not authorized for platform-funded spend.' }
    }
    paidProviderApprovalId = approvalId
    log.log('render.approval_issued', { providerId: input.providerId, providerCostCents, paidProviderApprovalId })
  }

  const apiKey = funding.mode === 'byok' ? (funding.apiKey || null) : host.resolvePlatformKey(input.providerId)
  if (!apiKey) return { ok: false, code: 'no_key', message: 'No API key available for this provider.' }

  let reservationId: string | null = null
  let charged = false
  if (funding.mode === 'wallet') {
    // The approval reference travels into the ledger so the charge and the
    // authorization it was made under are reconcilable after the fact.
    const reservation = await host.wallet.reserve(actor, providerCostCents, {
      providerId: input.providerId,
      kind: input.kind,
      reference: paidProviderApprovalId || undefined,
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
    return { ok: true, url: persisted.url, providerCostCents, charged, paidProviderApprovalId: paidProviderApprovalId || undefined }
  } catch (err) {
    if (funding.mode === 'wallet' && reservationId) {
      try { await host.wallet.refund(actor, reservationId) } catch { }
    }
    const message = err instanceof Error ? err.message : 'Provider render failed.'
    log.log('render.provider_failed', { providerId: input.providerId, message })
    return { ok: false, code: 'provider_failed', message }
  }
}
