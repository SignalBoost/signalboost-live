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

/** Durable at-most-once dispatch ledger. */
export class SupabaseDispatchStore implements DispatchStore {
  private readonly db: any

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
  if (input.store) return input.store
  if (input.supabase) return new SupabaseDispatchStore(input.supabase)
  const runtime = input.runtime ?? 'development'
  if (runtime === 'production') throw new Error('durable_dispatch_store_required')
  return new InMemoryDispatchStore()
}
