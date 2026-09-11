export type CosCacheEntry<T> = {
  value: T
  createdAt: number
  expiresAt: number | null
}

export interface CosExactCacheStore {
  get<T>(key: string): Promise<CosCacheEntry<T> | null>
  set<T>(key: string, entry: CosCacheEntry<T>): Promise<void>
  delete(key: string): Promise<void>
}

export class MemoryCosExactCacheStore implements CosExactCacheStore {
  private readonly entries = new Map<string, CosCacheEntry<unknown>>()

  async get<T>(key: string): Promise<CosCacheEntry<T> | null> {
    const entry = this.entries.get(key) as CosCacheEntry<T> | undefined
    if (!entry) return null

    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.entries.delete(key)
      return null
    }

    return entry
  }

  async set<T>(key: string, entry: CosCacheEntry<T>): Promise<void> {
    this.entries.set(key, entry)
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key)
  }
}

const inFlight = new Map<string, Promise<unknown>>()

export type CosCachedExecution<T> = {
  value: T
  source: 'exact-cache' | 'in-flight' | 'executed'
}

/**
 * Prevents COS from paying twice for identical work.
 *
 * The store is deliberately provider-neutral. Production stores can later use
 * Redis/Postgres without changing Portables or provider adapters.
 */
export async function executeWithCosExactCache<T>(args: {
  key: string
  store: CosExactCacheStore
  execute: () => Promise<T>
  ttlMs?: number | null
}): Promise<CosCachedExecution<T>> {
  const cached = await args.store.get<T>(args.key)
  if (cached) return { value: cached.value, source: 'exact-cache' }

  const existing = inFlight.get(args.key) as Promise<T> | undefined
  if (existing) return { value: await existing, source: 'in-flight' }

  const execution = args.execute()
  inFlight.set(args.key, execution)

  try {
    const value = await execution
    const createdAt = Date.now()
    await args.store.set(args.key, {
      value,
      createdAt,
      expiresAt: args.ttlMs == null ? null : createdAt + args.ttlMs,
    })
    return { value, source: 'executed' }
  } finally {
    inFlight.delete(args.key)
  }
}
