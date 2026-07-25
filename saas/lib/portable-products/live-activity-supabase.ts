// saas/lib/portable-products/live-activity-supabase.ts
//
// The host adapter that makes the portable backend show REAL data. live-activity.ts decides
// which tables matter and how to interpret them; this file is the only part that touches a
// database.
//
// Server-only: it uses the service-role key, which bypasses RLS. It is called from an
// admin-gated page and an admin-gated route, never from the client.
//
// It reads and counts. It never writes, never reads row CONTENT, and never takes a table
// name from a request — table names come only from the frozen map in live-activity.ts. So
// the worst this can leak is how many rows exist and when the newest one arrived, which is
// exactly the operational truth the page is supposed to show.

import { createClient } from '@supabase/supabase-js'
import type { PortableActivityStore } from './live-activity.ts'

/**
 * Build the store, or null when this deployment has no service-role credentials.
 *
 * Returning null is deliberate: the caller then reports the backend as unreadable rather
 * than rendering zeros, which would look identical to "wired but never used" and quietly
 * misrepresent a misconfigured environment as a healthy idle one.
 */
export function createSupabasePortableActivityStore(): PortableActivityStore | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key) return null

  const client = createClient(url, key)

  return {
    async readTableActivity(table: string, timestampColumn: string) {
      // head:true + count:'exact' returns the count without transferring any rows.
      const counted = await client.from(table).select('*', { count: 'exact', head: true })
      if (counted.error) throw new Error(`${table}: ${counted.error.message}`)

      const rowCount = counted.count ?? 0
      if (rowCount === 0) return { rowCount: 0, lastActivityAt: null }

      // A missing or differently-named timestamp column must not discard a valid count —
      // "3 rows, recency unknown" is more truthful than reporting the table unreadable.
      try {
        const latest = await client
          .from(table)
          .select(timestampColumn)
          .order(timestampColumn, { ascending: false })
          .limit(1)
        if (latest.error) return { rowCount, lastActivityAt: null }
        const row = latest.data?.[0] as unknown as Record<string, unknown> | undefined
        const value = row?.[timestampColumn]
        return { rowCount, lastActivityAt: typeof value === 'string' ? value : null }
      } catch {
        return { rowCount, lastActivityAt: null }
      }
    },
  }
}
