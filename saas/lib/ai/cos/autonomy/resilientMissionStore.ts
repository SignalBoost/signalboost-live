import { createClient } from '@supabase/supabase-js'
import { ensureCosMissionStore } from './missionStoreBootstrap'

const TABLE = 'cos_autonomy_state'
const memory = new Map<string, StoredMission>()

export interface StoredMission {
  mission_id: string
  state: Record<string, unknown>
  updated_at: string
}

export interface MissionStoreHealth {
  mode: 'primary' | 'degraded'
  repaired: boolean
  reason?: string
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function isStoreFailure(message: string): boolean {
  return /(cos_autonomy_state|schema cache|could not find|does not exist|42P01|PGRST204|fetch failed|network|connection)/i.test(message)
}

export class ResilientMissionStore {
  private degraded = false
  private repaired = false
  private degradedReason = ''

  health(): MissionStoreHealth {
    return this.degraded
      ? { mode: 'degraded', repaired: this.repaired, reason: this.degradedReason || 'Primary mission store unavailable.' }
      : { mode: 'primary', repaired: this.repaired }
  }

  private degrade(reason: string) {
    this.degraded = true
    this.degradedReason = reason
  }

  private async recoverPrimary(): Promise<boolean> {
    const readiness = await ensureCosMissionStore().catch(error => ({
      ok: false,
      repaired: false,
      error: error instanceof Error ? error.message : 'mission store recovery failed',
    }))
    this.repaired = Boolean(readiness.repaired)
    if (readiness.ok) {
      this.degraded = false
      this.degradedReason = ''
      return true
    }
    this.degrade(readiness.error || 'Primary mission store unavailable.')
    return false
  }

  async save(row: StoredMission): Promise<void> {
    const db = admin()
    if (!db) {
      this.degrade('Supabase service role is not configured.')
      memory.set(row.mission_id, row)
      return
    }

    if (!this.degraded) {
      const { error } = await db.from(TABLE).upsert(row, { onConflict: 'mission_id' })
      if (!error) {
        memory.set(row.mission_id, row)
        return
      }
      if (!isStoreFailure(error.message || '')) throw new Error(error.message || 'mission update failed')
      if (await this.recoverPrimary()) {
        const retry = await db.from(TABLE).upsert(row, { onConflict: 'mission_id' })
        if (!retry.error) {
          memory.set(row.mission_id, row)
          return
        }
        this.degrade(retry.error.message || 'Mission store retry failed.')
      }
    }

    // Degraded storage is intentionally non-terminal. This keeps the current
    // engineering mission alive even when the preferred durable store is unavailable.
    memory.set(row.mission_id, row)
  }

  async get(missionId: string): Promise<StoredMission | null> {
    const db = admin()
    if (!db || this.degraded) return memory.get(missionId) || null

    const { data, error } = await db.from(TABLE)
      .select('mission_id,state,updated_at')
      .eq('mission_id', missionId)
      .maybeSingle()
    if (!error) return data ? data as StoredMission : (memory.get(missionId) || null)
    if (!isStoreFailure(error.message || '')) return memory.get(missionId) || null

    if (await this.recoverPrimary()) {
      const retry = await db.from(TABLE)
        .select('mission_id,state,updated_at')
        .eq('mission_id', missionId)
        .maybeSingle()
      if (!retry.error && retry.data) return retry.data as StoredMission
    }
    return memory.get(missionId) || null
  }

  async list(prefix: string, limit = 50): Promise<StoredMission[]> {
    const db = admin()
    if (db && !this.degraded) {
      const { data, error } = await db.from(TABLE)
        .select('mission_id,state,updated_at')
        .like('mission_id', `${prefix}%`)
        .order('updated_at', { ascending: true })
        .limit(limit)
      if (!error) {
        const rows = (data || []) as StoredMission[]
        for (const row of rows) memory.set(row.mission_id, row)
        return rows
      }
      if (isStoreFailure(error.message || '')) await this.recoverPrimary()
    }

    return [...memory.values()]
      .filter(row => row.mission_id.startsWith(prefix))
      .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
      .slice(0, limit)
  }
}

export const resilientMissionStore = new ResilientMissionStore()
