import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExactCacheEntry, ExactCacheStore } from '../layers/exact-cache'

export class SupabaseExactCacheStore implements ExactCacheStore {
  constructor(private readonly db: SupabaseClient) {}

  async get<T>(key: string): Promise<ExactCacheEntry<T> | null> {
    const { data, error } = await this.db
      .from('cos_exact_cache')
      .select('value,created_at_ms,expires_at_ms')
      .eq('cache_key', key)
      .maybeSingle()
    if (error) throw error
    if (!data) return null

    const expiresAt = data.expires_at_ms == null ? null : Number(data.expires_at_ms)
    if (expiresAt !== null && expiresAt <= Date.now()) {
      await this.delete(key)
      return null
    }

    return {
      value: data.value as T,
      createdAt: Number(data.created_at_ms),
      expiresAt,
    }
  }

  async set<T>(key: string, entry: ExactCacheEntry<T>): Promise<void> {
    const { error } = await this.db.from('cos_exact_cache').upsert({
      cache_key: key,
      value: entry.value,
      created_at_ms: entry.createdAt,
      expires_at_ms: entry.expiresAt,
      updated_at: new Date().toISOString(),
    })
    if (error) throw error
  }

  async delete(key: string): Promise<void> {
    const { error } = await this.db.from('cos_exact_cache').delete().eq('cache_key', key)
    if (error) throw error
  }
}
