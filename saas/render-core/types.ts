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

/** What a provider produces. */
export type RenderKind = 'voice' | 'video' | 'image'

/** How a given render is funded. */
export type FundingMode =
  | { mode: 'wallet' }
  | { mode: 'byok'; apiKey: string }

/** A provider executor: one file per provider, self-registered. */
export interface RenderExecutor {
  providerId: string
  kind: RenderKind
  /**
   * Estimate provider cost in whole US cents for this input, BEFORE producing.
   * Must be deterministic and not call the network. Used to reserve funds.
   */
  estimateCostCents(input: RenderInput): number
  /**
   * Produce the asset. Receives the resolved API key (BYOK key, or the host's
   * platform key injected by the host). Returns bytes + content type.
   */
  produce(input: RenderInput, apiKey: string): Promise<RenderProduced>
}

export interface RenderInput {
  providerId: string
  kind: RenderKind
  /** Free-form provider params (e.g. { text, voiceId } for voice). */
  params: Record<string, unknown>
}

export interface RenderProduced {
  bytes: ArrayBuffer
  contentType: string
  /** Provider-reported units (e.g. characters) for logging/audit. */
  units?: number
}

/** Host-supplied identity. The core never reads cookies or a session itself. */
export interface RenderActor {
  userId: string
}

/**
 * Wallet adapter — the host implements this over its own billing store.
 * The core never touches the host DB directly.
 */
export interface WalletAdapter {
  /** Reserve `providerCostCents` worth of funds for `actor`. Returns a handle
   *  on success, or a typed failure. Must be atomic + refuse to overspend. */
  reserve(actor: RenderActor, providerCostCents: number, meta: ReserveMeta): Promise<ReserveResult>
  /** Release a prior reservation because production failed. */
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

/**
 * Storage adapter — the host persists produced bytes wherever it likes
 * (Supabase storage, S3, R2, …) and returns a URL the caller can use.
 */
export interface StorageAdapter {
  persist(bytes: ArrayBuffer, contentType: string, keyHint: string): Promise<{ url: string }>
}

/** Optional structured logging. Defaults to console in the host if omitted. */
export interface RenderLogAdapter {
  log(event: string, data: Record<string, unknown>): void
}

/** The assembled host the engine runs against. */
export interface RenderHost {
  wallet: WalletAdapter
  storage: StorageAdapter
  log: RenderLogAdapter
  /** Resolve the platform API key for a provider (wallet mode). BYOK bypasses this. */
  resolvePlatformKey(providerId: string): string | null
}

export type RenderResult = {
  ok: boolean
  url?: string
  providerCostCents?: number
  charged?: boolean
  code?: 'no_executor' | 'insufficient_funds' | 'daily_cap' | 'no_key' | 'provider_failed' | 'error'
  message?: string
}
