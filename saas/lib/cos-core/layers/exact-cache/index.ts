import { createHash } from 'node:crypto'

export type ExactCacheEntry<T> = {
  value: T
  createdAt: number
  expiresAt: number | null
}

export interface ExactCacheStore {
  get<T>(key: string): Promise<ExactCacheEntry<T> | null>
  set<T>(key: string, entry: ExactCacheEntry<T>): Promise<void>
  delete(key: string): Promise<void>
}

export class MemoryExactCacheStore implements ExactCacheStore {
  private readonly entries = new Map<string, ExactCacheEntry<unknown>>()

  async get<T>(key: string): Promise<ExactCacheEntry<T> | null> {
    const entry = this.entries.get(key) as ExactCacheEntry<T> | undefined
    if (!entry) return null
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.entries.delete(key)
      return null
    }
    return entry
  }

  async set<T>(key: string, entry: ExactCacheEntry<T>): Promise<void> {
    this.entries.set(key, entry)
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key)
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    )
  }
  return value
}

export function createExactCacheKey(input: {
  taskId: string
  prompt: string
  contextFingerprint: string
  policyVersion?: string | null
  knowledgeVersion?: string | null
}): string {
  const payload = JSON.stringify(canonicalize({
    taskId: input.taskId,
    prompt: input.prompt,
    contextFingerprint: input.contextFingerprint,
    policyVersion: input.policyVersion ?? null,
    knowledgeVersion: input.knowledgeVersion ?? null,
  }))
  return `cos:exact:v1:${createHash('sha256').update(payload).digest('hex')}`
}

const inFlight = new Map<string, Promise<unknown>>()

export class ExactCacheLayer {
  constructor(
    private readonly store: ExactCacheStore,
    private readonly options: {
      ttlMs?: number | null
      onError?: (error: unknown) => void
    } = {},
  ) {}

  async execute<T>(key: string, work: () => Promise<T>): Promise<{
    value: T
    source: 'exact_cache' | 'in_flight' | 'executed'
  }> {
    try {
      const cached = await this.store.get<T>(key)
      if (cached) return { value: cached.value, source: 'exact_cache' }
    } catch (error) {
      this.options.onError?.(error)
    }

    const existing = inFlight.get(key) as Promise<T> | undefined
    if (existing) return { value: await existing, source: 'in_flight' }

    const promise = work()
    inFlight.set(key, promise)

    try {
      const value = await promise
      const createdAt = Date.now()
      try {
        await this.store.set(key, {
          value,
          createdAt,
          expiresAt: this.options.ttlMs == null ? null : createdAt + this.options.ttlMs,
        })
      } catch (error) {
        this.options.onError?.(error)
      }
      return { value, source: 'executed' }
    } finally {
      inFlight.delete(key)
    }
  }
}
