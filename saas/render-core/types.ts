// saas/render-core/types.ts
//
// Portable render-module contracts. NOTHING here imports the host app's DB,
// auth, storage, or UI — that is the whole point (see ONBOARD.md §12C, and the
// console-core README for the reference pattern). A host platform (SignalBoost
// today, a buyer tomorrow) satisfies these interfaces with thin adapters.
//
// The render engine turns a render request into a produced asset through a fixed
// pipeline: price → reserve credits (or BYOK) → produce → persist → settle.
// Providers self-register as executors. Adding a provider = adding one executor.

export type RenderKind = 'voice' | 'video' | 'image'

export type FundingMode =
  | { mode: 'wallet' }
  | { mode: 'byok'; apiKey: string }

export interface RenderExecutor {
  providerId: string
  kind: RenderKind
  estimateCostCents(input: RenderInput): number
  produce(input: RenderInput, apiKey: string): Promise<RenderProduced>
}

export interface RenderInput {
  providerId: string
  kind: RenderKind
  params: Record<string, unknown>
  /**
   * Required for wallet-funded renders with a non-zero provider cost. This is
   * the server-side payment/owner approval gate for paid platform providers.
   * BYOK renders are funded by the user's own key and do not consume platform
   * provider spend.
   */
  paidProviderApprovalId?: string
}

export interface RenderProduced {
  bytes: ArrayBuffer
  contentType: string
  units?: number
}

export interface RenderActor {
  userId: string
}

export interface WalletAdapter {
  reserve(actor: RenderActor, providerCostCents: number, meta: ReserveMeta): Promise<ReserveResult>
  refund(actor: RenderActor, reservationId: string): Promise<void>
}

export interface ReserveMeta {
  providerId: string
  kind: RenderKind
  reference?: string
}

export type ReserveResult = {
  ok: boolean
  reservationId?: string
  code?: 'insufficient_funds' | 'daily_cap' | 'error'
  message?: string
}

export interface StorageAdapter {
  persist(bytes: ArrayBuffer, contentType: string, keyHint: string): Promise<{ url: string }>
}

export interface RenderLogAdapter {
  log(event: string, data: Record<string, unknown>): void
}

/**
 * Mints the server-side approval reference a wallet-funded paid render needs.
 *
 * The gate it satisfies exists so platform money cannot leave on a client's say-so.
 * A host implements this to define what counts as server-side authorization for
 * its own funding model — for a credits product that is normally "this authenticated
 * user has credits and is under their cap", which the wallet reservation then proves.
 *
 * A host that does NOT implement this keeps the strict behaviour: every wallet-funded
 * paid render is refused unless the caller supplies an explicit approval reference.
 * Absent issuer means blocked, never allowed.
 */
export interface PaidProviderApprovalAdapter {
  issue(request: PaidProviderApprovalRequest): Promise<PaidProviderApprovalResult>
}

export interface PaidProviderApprovalRequest {
  actor: RenderActor
  providerId: string
  kind: RenderKind
  providerCostCents: number
}

export type PaidProviderApprovalResult =
  | { ok: true; approvalId: string }
  | { ok: false; reason?: string }

export interface RenderHost {
  wallet: WalletAdapter
  storage: StorageAdapter
  log: RenderLogAdapter
  resolvePlatformKey(providerId: string): string | null
  /** Optional. Omit it and wallet-funded paid renders stay blocked. */
  approvals?: PaidProviderApprovalAdapter
}

export type RenderResult = {
  ok: boolean
  url?: string
  providerCostCents?: number
  charged?: boolean
  code?: 'no_executor' | 'approval_required' | 'insufficient_funds' | 'daily_cap' | 'no_key' | 'provider_failed' | 'error'
  message?: string
  /** The approval reference this render was authorized under, for audit. */
  paidProviderApprovalId?: string
}
