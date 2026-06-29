// saas/marketing-sales-core/store.ts
// The MarketingStore interface lives in types.ts. The live Supabase adapter is
// supplied by the host (marketing-sales-host). This in-memory adapter exists so
// the core can be exercised with zero host — proving portability, used in tests.
import type { MarketingStore, StoreRow } from './types'

export function createMemoryStore(): MarketingStore {
  const tables = new Map<string, Map<string, StoreRow>>()
  const tbl = (name: string) => {
    if (!tables.has(name)) tables.set(name, new Map())
    return tables.get(name) as Map<string, StoreRow>
  }
  const matches = (row: StoreRow, where: StoreRow) =>
    Object.keys(where).every((k) => row[k] === where[k])

  return {
    async select<T = StoreRow>(table: string, where: StoreRow): Promise<T[]> {
      return Array.from(tbl(table).values()).filter((r) => matches(r, where)) as T[]
    },
    async insert<T = StoreRow>(table: string, row: StoreRow): Promise<T> {
      const id = String(row.id || `${table}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
      const saved = { ...row, id }
      tbl(table).set(id, saved)
      return saved as T
    },
    async update<T = StoreRow>(table: string, id: string, patch: StoreRow): Promise<T> {
      const cur = tbl(table).get(id) || { id }
      const saved = { ...cur, ...patch, id }
      tbl(table).set(id, saved)
      return saved as T
    },
    async count(table: string, where: StoreRow): Promise<number> {
      return (await this.select(table, where)).length
    },
  }
}
