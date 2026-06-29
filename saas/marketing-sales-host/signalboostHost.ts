// saas/marketing-sales-host/signalboostHost.ts
// The single SignalBoost-coupled file: it implements the portable MarketingHost
// against this app's stack (Supabase service-role client + verified session role).
// Swap THIS file to run the department in another company; the core never changes.
import crypto from 'node:crypto'
import type { MarketingHost, MarketingStore, Actor, AuditEntry } from '@/marketing-sales-core'

// SignalBoost is the first ("guinea pig") org. Multi-org isolation is already in
// the schema (org_id on every row); a multi-tenant host would derive this per request.
const SIGNALBOOST_ORG = 'signalboost'

function makeStore(admin: any): MarketingStore {
  return {
    async select(table, where) {
      const { data, error } = await admin.from(table).select('*').match(where)
      if (error) throw new Error(error.message)
      return data || []
    },
    async insert(table, row) {
      const { data, error } = await admin.from(table).insert(row).select().single()
      if (error) throw new Error(error.message)
      return data
    },
    async update(table, id, patch) {
      const { data, error } = await admin.from(table).update(patch).eq('id', id).select().single()
      if (error) throw new Error(error.message)
      return data
    },
    async count(table, where) {
      const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true }).match(where)
      if (error) throw new Error(error.message)
      return count || 0
    },
  }
}

// AES-256-GCM via node:crypto + env key. Unused by the first vertical (no secrets
// yet); real once the YouTube connector lands. Self-contained, no vault coupling.
function makeCrypto() {
  const hex = process.env.MARKETING_SALES_CRYPTO_KEY || ''
  const key = hex ? Buffer.from(hex, 'hex') : null
  const needKey = () => { if (!key || key.length !== 32) throw new Error('MARKETING_SALES_CRYPTO_KEY (32-byte hex) not set') }
  return {
    async encrypt(plain: string) {
      needKey()
      const iv = crypto.randomBytes(12)
      const c = crypto.createCipheriv('aes-256-gcm', key as Buffer, iv)
      const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()])
      return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64')
    },
    async decrypt(b64: string) {
      needKey()
      const raw = Buffer.from(b64, 'base64')
      const d = crypto.createDecipheriv('aes-256-gcm', key as Buffer, raw.subarray(0, 12))
      d.setAuthTag(raw.subarray(12, 28))
      return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8')
    },
  }
}

export function signalboostActor(user: { id: string; email?: string }): Actor {
  // requireAdmin() already proved owner/admin; the department treats that as admin.
  return { id: user.id, email: user.email, role: 'admin', orgId: SIGNALBOOST_ORG }
}

export function createSignalBoostMarketingHost(admin: any, actor: Actor): MarketingHost {
  const store = makeStore(admin)
  return {
    auth: {
      async getCurrentActor() { return actor },
      canApprove(a) { return a.role === 'owner' || a.role === 'admin' },
    },
    log: {
      async logAction(entry: AuditEntry) {
        try {
          await store.insert('ms_audit', {
            actor_id: entry.actor_id, org_id: entry.org_id, action: entry.action,
            outcome: entry.outcome || null, detail: entry.detail || null,
          })
        } catch { /* audit must never break the action */ }
      },
    },
    store,
    crypto: makeCrypto(),
    env: (k) => process.env[k],
    now: () => new Date(),
    schedule: () => { /* director loop + Vercel cron wired in a later task */ },
  }
}
