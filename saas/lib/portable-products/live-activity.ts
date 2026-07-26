// saas/lib/portable-products/live-activity.ts
//
// LIVE OPERATIONAL SIGNAL for each portable — the part the portable backend was missing.
//
// Everything else under lib/portable-products/ inspects METADATA: it reads the manifests and
// reports what was typed into them. readiness.ts says so in its own doc comment — it "does
// not inspect runtime state or execute tests, providers, browsers, packages, or deployments".
// That means a portable shows green because someone filled in an array, not because anything
// works. This module answers a different and harder question: has this thing actually done
// anything, and when.
//
// TWO RULES THAT KEEP IT HONEST:
//
//  1. EVERY SOURCE IS A TABLE THE PORTABLE'S OWN CODE WRITES TO. The map below was built by
//     grepping each portable's directory for its actual queries, not from the manifests.
//     A manifest can claim a capability; a row cannot.
//  2. NO SOURCE MEANS "NO LIVE SOURCE", NEVER A PASS. Some portables write nothing at all.
//     They report `no_live_source` and are explicitly NOT ready — the whole point is to stop
//     a portable looking healthy because nobody wired it up. Silence is the finding.
//  3. A TABLE PLUS AN ADAPTER IS NOT A WRITER. This rule was added after two portables were
//     given a durable table and a storage adapter, and were then reported as "connected,
//     idle" on the homepage — which reads as *wired up, just quiet*. Nothing called either
//     adapter, so the row count could never move off zero. A source counts ONLY when a
//     reachable code path actually inserts rows. An adapter nobody calls is a plan, not a
//     signal, and NO_LIVE_SOURCE_REASONS below says so out loud for each affected portable.
//
// Table names come only from the frozen constant below and are never taken from a request,
// so this cannot become an arbitrary-table read.

/** A table a portable actually writes to, plus the column that marks recency. */
export interface PortableActivitySource {
  readonly table: string
  /** Column used for "last activity". Most tables here use created_at. */
  readonly timestampColumn: string
  /** What a row in this table means, in plain language, for the operator reading the page. */
  readonly meaning: string
}

/**
 * productId → the tables its own code writes to.
 *
 * Verified by grepping each portable's source directory, July 2026:
 *   press-media                app/api/agency/press-*
 *   integrations-hub           lib/engine
 *   self-healing-supervisor    lib/supervisor
 *   control-center             console-core
 *   campaign-studio            lib/cos
 *   portable-ai-chief-of-staff lib/cos-backup
 *   video-maker                video job + artifact tables
 *   marketing-sales            its own ms_* department schema
 *
 * Absent on purpose — see NO_LIVE_SOURCE_REASONS for the reason in each case:
 * provider-hub, browser-agent-ecosystem, agent-operations-platform.
 */
export const PORTABLE_ACTIVITY_SOURCES: Readonly<Record<string, readonly PortableActivitySource[]>> = Object.freeze({
  'press-media': Object.freeze([
    { table: 'press_campaigns', timestampColumn: 'created_at', meaning: 'press campaigns created' },
  ]),
  'integrations-hub': Object.freeze([
    { table: 'provider_registry', timestampColumn: 'created_at', meaning: 'configured provider actions' },
    { table: 'user_provider_configs', timestampColumn: 'created_at', meaning: 'connected user provider credentials' },
  ]),
  'self-healing-supervisor': Object.freeze([
    // The webhook path — detect, diagnose, dispatch, stage — writes HERE and nowhere else.
    // The three tables below belong to the executor and health-observation paths, which this
    // pipeline does not touch. Leaving them as the only sources meant a supervisor that had
    // just staged nine real repairs still reported "Not connected".
    { table: 'infrastructure_prs', timestampColumn: 'created_at', meaning: 'infrastructure changes staged for approval, including supervisor-diagnosed repairs' },
    { table: 'supervisor_dispatch_ledger', timestampColumn: 'claimed_at', meaning: 'repair dispatches claimed' },
    { table: 'supervisor_executions', timestampColumn: 'created_at', meaning: 'supervisor executions recorded' },
    { table: 'vercel_deployment_health_runs', timestampColumn: 'created_at', meaning: 'deployment health observations' },
  ]),
  'control-center': Object.freeze([
    { table: 'vault_items', timestampColumn: 'created_at', meaning: 'secrets held in the vault' },
    { table: 'email_delivery_status', timestampColumn: 'created_at', meaning: 'email deliveries tracked' },
    { table: 'outreach_social_tokens', timestampColumn: 'created_at', meaning: 'connected social accounts' },
  ]),
  'campaign-studio': Object.freeze([
    { table: 'cos_campaign_queue', timestampColumn: 'created_at', meaning: 'campaigns queued' },
    { table: 'cos_events', timestampColumn: 'created_at', meaning: 'campaign events recorded' },
    { table: 'cos_mining_runs', timestampColumn: 'created_at', meaning: 'audience mining runs' },
  ]),
  'portable-ai-chief-of-staff': Object.freeze([
    { table: 'cos_decisions', timestampColumn: 'created_at', meaning: 'chief-of-staff decisions logged' },
  ]),
  'video-maker': Object.freeze([
    { table: 'video_jobs', timestampColumn: 'created_at', meaning: 'video render and export jobs' },
    { table: 'video_storage', timestampColumn: 'created_at', meaning: 'video artifacts stored' },
  ]),
  'marketing-sales': Object.freeze([
    { table: 'ms_campaigns', timestampColumn: 'created_at', meaning: 'marketing and sales campaigns created' },
    { table: 'ms_drafts', timestampColumn: 'created_at', meaning: 'campaign drafts created' },
    { table: 'ms_publish_results', timestampColumn: 'at', meaning: 'publishing outcomes recorded' },
    { table: 'ms_metrics', timestampColumn: 'captured_at', meaning: 'campaign metrics captured' },
    { table: 'ms_audit', timestampColumn: 'at', meaning: 'department actions audited' },
  ]),
})

/**
 * Why a portable has no live source. Every portable absent from the map above MUST appear
 * here, so "no signal" is always an explained finding rather than an oversight — and so a
 * future reader can tell a portable that was never wired from one that was wired to a table
 * nothing writes.
 *
 * These strings are shown to the operator. They say what is actually missing, which is also
 * exactly what has to be built for the portable to earn a live source.
 */
export const NO_LIVE_SOURCE_REASONS: Readonly<Record<string, string>> = Object.freeze({
  'provider-hub': 'Provider Hub records connections through the integrations engine rather than a table of its own, so it has no independent operational signal.',
  'browser-agent-ecosystem':
    'A portable_browser_activity table and a Supabase adapter both exist, but nothing anywhere calls the adapter — and no browser runtime exists to generate events in the first place, since Chromium cannot run in a serverless function. The row count cannot move until a real browser host runs work.',
  'agent-operations-platform':
    'An agent_operation_activity table and a Supabase adapter both exist, but nothing outside lib/agent-runtime imports the runtime at all, so no workflow is ever coordinated and no row is ever written. It needs a caller, not more machinery.',
})

export type PortableLiveStatus =
  /** Rows exist. The portable has genuinely done something. */
  | 'active'
  /** The table exists and is reachable but empty. Wired, never used. */
  | 'idle'
  /** The table could not be read — missing, permission denied, or the query failed. */
  | 'unreachable'
  /** This portable's code writes no table at all. Nothing to report, and that IS the finding. */
  | 'no_live_source'

export interface PortableTableActivity {
  readonly table: string
  readonly meaning: string
  readonly rowCount: number | null
  readonly lastActivityAt: string | null
  readonly status: Exclude<PortableLiveStatus, 'no_live_source'>
  readonly error?: string
}

export interface PortableLiveActivity {
  readonly productId: string
  readonly status: PortableLiveStatus
  readonly tables: readonly PortableTableActivity[]
  /** Most recent activity across all of this portable's tables. */
  readonly lastActivityAt: string | null
  /** Total rows across all of its tables. */
  readonly totalRows: number
  /** Plain-language summary for the operator. */
  readonly summary: string
}

/** What the host must implement. One read, no writes, no schema access. */
export interface PortableActivityStore {
  /**
   * Return the row count and most recent timestamp for a table.
   * Throw or return null fields on failure — the caller degrades to 'unreachable'
   * rather than pretending the portable is idle.
   */
  readTableActivity(
    table: string,
    timestampColumn: string,
  ): Promise<{ rowCount: number | null; lastActivityAt: string | null }>
}

function summarize(productId: string, status: PortableLiveStatus, totalRows: number, last: string | null): string {
  switch (status) {
    case 'no_live_source': {
      const reason = NO_LIVE_SOURCE_REASONS[productId]
      return reason
        ? `${productId} has no live operational signal. ${reason}`
        : `${productId} writes no operational table. Nothing about this portable can be verified from live data.`
    }
    case 'unreachable':
      return `${productId} has operational tables but at least one could not be read. Treat its status as unknown, not healthy.`
    case 'idle':
      return `${productId} is wired to its tables but no rows exist yet. It has never done anything in this environment.`
    case 'active':
      return `${productId} has ${totalRows} row${totalRows === 1 ? '' : 's'} of real activity${last ? `, most recently ${last}` : ''}.`
  }
}

/** Read live activity for one portable. Never throws. */
export async function loadPortableActivity(
  productId: string,
  store: PortableActivityStore,
): Promise<PortableLiveActivity> {
  const sources = PORTABLE_ACTIVITY_SOURCES[productId]

  if (!sources || sources.length === 0) {
    return {
      productId,
      status: 'no_live_source',
      tables: [],
      lastActivityAt: null,
      totalRows: 0,
      summary: summarize(productId, 'no_live_source', 0, null),
    }
  }

  const tables: PortableTableActivity[] = []
  for (const source of sources) {
    try {
      const result = await store.readTableActivity(source.table, source.timestampColumn)
      const count = result.rowCount
      tables.push({
        table: source.table,
        meaning: source.meaning,
        rowCount: count,
        lastActivityAt: result.lastActivityAt,
        status: count === null ? 'unreachable' : count > 0 ? 'active' : 'idle',
      })
    } catch (err) {
      tables.push({
        table: source.table,
        meaning: source.meaning,
        rowCount: null,
        lastActivityAt: null,
        status: 'unreachable',
        error: err instanceof Error ? err.message : 'read failed',
      })
    }
  }

  // An unreachable table dominates: a portable with an unreadable table is NOT verified
  // healthy just because a sibling table happened to have rows.
  const anyUnreachable = tables.some((t) => t.status === 'unreachable')
  const anyActive = tables.some((t) => t.status === 'active')
  const status: PortableLiveStatus = anyUnreachable ? 'unreachable' : anyActive ? 'active' : 'idle'

  const totalRows = tables.reduce((sum, t) => sum + (t.rowCount ?? 0), 0)
  const stamps = tables.map((t) => t.lastActivityAt).filter((v): v is string => typeof v === 'string' && v.length > 0)
  const lastActivityAt = stamps.length ? stamps.slice().sort().at(-1) ?? null : null

  return { productId, status, tables, lastActivityAt, totalRows, summary: summarize(productId, status, totalRows, lastActivityAt) }
}

/** Read live activity for many portables, in the order given. */
export async function loadAllPortableActivity(
  productIds: readonly string[],
  store: PortableActivityStore,
): Promise<readonly PortableLiveActivity[]> {
  const out: PortableLiveActivity[] = []
  for (const id of productIds) out.push(await loadPortableActivity(id, store))
  return out
}

/** Portables whose code writes no operational table at all. */
export function portablesWithoutLiveSource(productIds: readonly string[]): readonly string[] {
  return productIds.filter((id) => !PORTABLE_ACTIVITY_SOURCES[id]?.length)
}

/**
 * Portables that have neither a live source nor a stated reason for lacking one.
 *
 * This should always be empty. A non-empty result means a portable is reporting "no signal"
 * with no explanation attached — which is how an unwired portable quietly starts looking
 * like a merely quiet one.
 */
export function portablesWithUnexplainedSilence(productIds: readonly string[]): readonly string[] {
  return productIds.filter(
    (id) => !PORTABLE_ACTIVITY_SOURCES[id]?.length && !NO_LIVE_SOURCE_REASONS[id],
  )
}
