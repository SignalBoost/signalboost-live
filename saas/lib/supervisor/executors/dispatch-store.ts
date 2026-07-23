export interface DispatchClaim {
  readonly dispatchId: string
  readonly incidentId: string
  readonly executorKind: string
  readonly claimedAt: string
  readonly workItemId?: string
  readonly executionId?: string
}

export interface DispatchStore {
  claim(input: DispatchClaim): Promise<boolean>
}

export class InMemoryDispatchStore implements DispatchStore {
  private readonly consumed = new Set<string>()

  async claim(input: DispatchClaim): Promise<boolean> {
    if (this.consumed.has(input.dispatchId)) return false
    this.consumed.add(input.dispatchId)
    return true
  }
}

const safe = (value: unknown, max = 240) => String(value ?? '').replace(/[\r\n\t]/g, ' ').slice(0, max)

/**
 * Durable at-most-once dispatch ledger.
 *
 * The database primary key on dispatch_id is the cross-process and cross-region
 * serialization boundary. A duplicate-key response means another dispatcher has
 * already claimed the exact dispatch ID and execution must not begin.
 */
export class SupabaseDispatchStore implements DispatchStore {
  private readonly db: any

  // NOTE: written as an explicit field, not a constructor parameter property.
  // Parameter properties emit an assignment, so they are NOT erasable syntax and
  // Node's strip-only TypeScript mode refuses to load the file — which takes the
  // whole test suite down with it. Keep it this way.
  constructor(db: any) {
    this.db = db
  }

  async claim(input: DispatchClaim): Promise<boolean> {
    const { error } = await this.db.from('supervisor_dispatch_ledger').insert({
      dispatch_id: input.dispatchId,
      incident_id: input.incidentId,
      executor_kind: input.executorKind,
      work_item_id: input.workItemId ?? null,
      execution_id: input.executionId ?? null,
      claimed_at: input.claimedAt,
      status: 'claimed',
      schema_version: 'supervisor-dispatch-ledger-v1',
    })
    if (!error) return true
    const code = String(error.code ?? '')
    const message = String(error.message ?? '').toLowerCase()
    if (code === '23505' || message.includes('duplicate') || message.includes('unique')) return false
    throw new Error(`dispatch_claim_failed:${safe(error.message || error.code || 'unknown', 120)}`)
  }
}

export function createSupervisorDispatchStore(input: { supabase?: any; runtime?: string; store?: DispatchStore } = {}): DispatchStore {
  // ENTERPRISE: a buyer passes their own durable store directly (e.g. the
  // database-neutral EnterpriseDispatchStore in ../portable/enterprise-dispatch-store).
  // This is the host-agnostic path — no env read, no Supabase assumption.
  if (input.store) return input.store
  // A buyer may still pass a Supabase client on the SignalBoost test rig.
  if (input.supabase) return new SupabaseDispatchStore(input.supabase)
  // Durability is required in production. `runtime` must be supplied explicitly by
  // the caller (the platform passes process.env.NODE_ENV via its own adapter — see
  // platformSupervisorRuntime()). Defaulting to 'development' here keeps a bare call
  // safe in tests without reading the environment inside the portable core.
  const runtime = input.runtime ?? 'development'
  if (runtime === 'production') throw new Error('durable_dispatch_store_required')
  return new InMemoryDispatchStore()
}

// PLATFORM-ONLY helper: the single place the test rig reads NODE_ENV to decide
// runtime. A buyer never calls this — they pass their own store or runtime.
export function platformSupervisorRuntime(): string {
  return process.env.NODE_ENV ?? 'development'
}
