// saas/marketing-sales-core/types.ts
// Portable contracts for the Marketing & Sales department. NO app imports — this
// is the whole point: the core depends only on the seams below, never on the host.

export type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
export const LANGS: Lang[] = ['en', 'es', 'pt', 'pl', 'ru']

export type Role = 'owner' | 'admin' | 'operator' | 'viewer'

// Campaign lifecycle. Only needs_approval -> approved|edits_requested|rejected is
// a human (management) decision; COS drives every other transition.
export type CampaignStatus =
  | 'intake'
  | 'drafting'
  | 'needs_approval'
  | 'edits_requested'
  | 'approved'
  | 'publishing'
  | 'published'
  | 'publish_failed'
  | 'rejected'
  | 'archived'
  | 'measuring'

// Charter decision outcomes (Command Control Charter vocabulary).
export type DecisionOutcome = 'open' | 'acknowledged' | 'resolved' | 'accepted_risk'

export interface Campaign {
  id: string
  org_id: string
  status: CampaignStatus
  objective: string
  channel: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface Draft {
  id: string
  org_id: string
  campaign_id: string
  lang: Lang
  title: string
  body: string
  asset_url: string | null   // null until a paid render/publish executor fills it
  asset_status: 'none' | 'pending' | 'ready'
}

export interface PublishResultRow {
  id: string
  org_id: string
  campaign_id: string
  connector_id: string
  live_url: string | null
  external_id: string | null
  ok: boolean
  error: string | null
  at: string
}

export interface Metric {
  id: string
  org_id: string
  campaign_id: string
  ctr: number | null
  roi: number | null
  retention: number | null
  captured_at: string
}

export interface AuditEntry {
  actor_id: string
  org_id: string
  action: string
  outcome?: DecisionOutcome
  detail: unknown
}

// ── Seams the host injects ────────────────────────────────────────────────────
export interface Actor { id: string; email?: string; role: Role; orgId: string }

export interface AuthAdapter {
  getCurrentActor(): Promise<Actor | null>
  // Approval (needs_approval -> approved|...) requires owner|admin.
  canApprove(actor: Actor): boolean
}

export interface LogAdapter {
  logAction(entry: AuditEntry): Promise<void>
}

export type StoreRow = Record<string, unknown>
export interface MarketingStore {
  select<T = StoreRow>(table: string, where: StoreRow): Promise<T[]>
  insert<T = StoreRow>(table: string, row: StoreRow): Promise<T>
  update<T = StoreRow>(table: string, id: string, patch: StoreRow): Promise<T>
  count(table: string, where: StoreRow): Promise<number>
}

export interface Crypto { encrypt(plain: string): Promise<string>; decrypt(cipher: string): Promise<string> }

// The full host the department runs on. An adopter implements this once.
export interface MarketingHost {
  auth: AuthAdapter
  log: LogAdapter
  store: MarketingStore
  crypto: Crypto
  env(key: string): string | undefined
  now(): Date
  schedule(id: string, everyMinutes: number, run: () => Promise<void>): void
}

// Flat result style (repo rule: tsconfig strict:false — keep unions flat).
export type Result<T = unknown> = { ok: true; data?: T } | { ok: false; error: string }
