// saas/lib/portable-browser/browser-activity-sinks.ts
//
// WHERE BROWSER ACTIVITY GETS RECORDED — DECLARED, NEVER HARDCODED.
//
// The portable used to record activity one way: create a Supabase client, read two environment
// variables, insert a row. That is a product decision made on the buyer's behalf. A Fortune 500
// running Oracle, or an SMB on a hosted MySQL, installs the archive and finds it demanding a
// vendor they do not use and looking for environment variables nobody will ever set — so it
// records nothing, silently. It also contradicts the one instruction in every security
// statement we hand a buyer: grep the payload for `process.env` and expect no results.
//
// THE PLATFORM RULE THIS FILE IMPLEMENTS: nothing static, nothing hardcoded. A destination is a
// DECLARATION — an id, the fields it needs, and how to write one event — and the buyer picks
// one from a live list and fills in fields the declaration itself describes. The popular
// destinations are pre-staged so most buyers never write code, and anything unusual is
// supported by the same mechanism rather than by a special case.
//
// TWO PRIMITIVES, SUPPLIED BY THE BUYER, AND NOTHING ELSE.
//
//   http  — send one request. Their client, their proxy, their TLS, their egress policy.
//   sql   — execute one parameterised statement. Their driver, their pool, their credentials.
//
// The payload therefore contains NO database driver, NO HTTP client, NO SDK, and NO credential.
// Adding Oracle support is a declaration, not a dependency. That is the whole point: this file
// grows by data, not by imports.
//
// WHY PARAMETERISED SQL IS THE ONLY SQL. Every statement here binds values as parameters. A
// runtime id or adapter id interpolated into a statement is an injection vector reachable from
// whatever names a browser session, and the buyer's database is not the place to discover that.
// The table name is the one identifier that cannot be a parameter, so it is validated against a
// strict pattern instead.
//
// WHAT A SINK MUST NEVER RECEIVE, restated because this file is where it would leak: no
// credentials, no URLs, no page content, no screenshots, no prompts, no browser evidence. The
// event shape in browser-activity-port.ts carries none of those, and nothing here adds any.
//
// PURE: no imports outside this portable, no environment reads, no packages.

import type { PortableBrowserActivityEvent, PortableBrowserActivityPort } from './browser-activity-port.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Buyer-supplied primitives
// ─────────────────────────────────────────────────────────────────────────────

export interface ActivityHttpRequest {
  readonly url: string
  readonly method: 'POST' | 'PUT'
  readonly headers: Readonly<Record<string, string>>
  /** Already serialised. The declaration decides the shape; the buyer only transmits it. */
  readonly body: string
}

export interface ActivityHttpResponse {
  readonly status: number
  readonly body?: string
}

/** The buyer's HTTP client. One method, because one is all a sink needs. */
export interface BrowserActivityHttpPort {
  send(request: ActivityHttpRequest): Promise<ActivityHttpResponse>
}

/** The buyer's database. Parameterised only — see the header. */
export interface BrowserActivitySqlPort {
  execute(statement: string, params: readonly unknown[]): Promise<void>
}

export interface BrowserActivityPrimitives {
  readonly http?: BrowserActivityHttpPort
  readonly sql?: BrowserActivitySqlPort
  /** Overridable so a test can pin the timestamp. Defaults to the system clock. */
  readonly now?: () => string
}

// ─────────────────────────────────────────────────────────────────────────────
// What a declaration looks like
// ─────────────────────────────────────────────────────────────────────────────

export type ActivitySinkCategory = 'sql' | 'http' | 'siem' | 'stream' | 'local'

/** Who the destination is typically found at. Drives grouping in a picker, nothing else. */
export type ActivitySinkAudience = 'enterprise' | 'smb' | 'both'

/**
 * One configuration field, described well enough that a UI can render it without knowing
 * anything about the destination — which is what makes the picker generic.
 */
export interface ActivitySinkField {
  readonly key: string
  readonly label: string
  readonly required: boolean
  /** Rendered masked, never logged, never echoed back. */
  readonly secret: boolean
  readonly placeholder?: string
  readonly help?: string
}

export interface BrowserActivitySinkDeclaration {
  readonly id: string
  readonly label: string
  readonly category: ActivitySinkCategory
  readonly audience: ActivitySinkAudience
  /** Which primitive the buyer must supply for this destination to work at all. */
  readonly requires: 'http' | 'sql' | 'none'
  readonly fields: readonly ActivitySinkField[]
  /** Anything a buyer should know before choosing it. Shown beside the option. */
  readonly notes?: string
  build(config: Readonly<Record<string, string>>, primitives: BrowserActivityPrimitives): PortableBrowserActivityPort
}

export type ActivitySinkResult =
  | { ok: true; port: PortableBrowserActivityPort; sinkId: string }
  | { ok: false; reason: string }

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

// The one identifier that cannot be bound as a parameter, so it is constrained instead.
const SAFE_TABLE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/

function requireField(config: Readonly<Record<string, string>>, key: string, sinkId: string): string {
  const value = String(config?.[key] ?? '').trim()
  if (!value) throw new Error(`${sinkId}: "${key}" is required and was not supplied.`)
  return value
}

function requireTable(config: Readonly<Record<string, string>>, sinkId: string, fallback: string): string {
  const table = String(config?.table ?? '').trim() || fallback
  if (!SAFE_TABLE.test(table)) {
    throw new Error(`${sinkId}: "${table}" is not a valid table name. Use letters, digits and underscores, optionally schema-qualified.`)
  }
  return table
}

function requireHttps(url: string, sinkId: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`${sinkId}: "${url}" is not a valid URL.`)
  }
  if (parsed.protocol !== 'https:') throw new Error(`${sinkId}: the endpoint must be https. Activity records leave your network on this connection.`)
  if (parsed.username || parsed.password) throw new Error(`${sinkId}: credentials embedded in the URL are refused. Supply them as fields instead.`)
  return parsed.toString()
}

function eventRow(event: PortableBrowserActivityEvent, at: string) {
  return {
    runtime_id: event.runtimeId,
    event_type: event.eventType,
    provider_id: event.providerId ?? null,
    adapter_id: event.adapterId ?? null,
    outcome: event.outcome ?? null,
    occurred_at: at,
  }
}

function clockOf(primitives: BrowserActivityPrimitives): () => string {
  return primitives?.now ?? (() => new Date().toISOString())
}

function needHttp(primitives: BrowserActivityPrimitives, sinkId: string): BrowserActivityHttpPort {
  if (!primitives?.http?.send) {
    throw new Error(`${sinkId}: an http primitive is required. Supply one so the request goes out through your own client, proxy and egress policy.`)
  }
  return primitives.http
}

function needSql(primitives: BrowserActivityPrimitives, sinkId: string): BrowserActivitySqlPort {
  if (!primitives?.sql?.execute) {
    throw new Error(`${sinkId}: a sql primitive is required. Supply one so statements run on your own driver and connection pool.`)
  }
  return primitives.sql
}

/**
 * A destination reached by one parameterised INSERT.
 *
 * Every SQL engine here differs only in how it spells a bind placeholder, so they share one
 * implementation. A new engine is four lines of declaration, never a driver dependency.
 */
function sqlSink(sinkId: string, defaultTable: string, placeholders: (index: number) => string) {
  return (config: Readonly<Record<string, string>>, primitives: BrowserActivityPrimitives): PortableBrowserActivityPort => {
    const sql = needSql(primitives, sinkId)
    const table = requireTable(config, sinkId, defaultTable)
    const now = clockOf(primitives)
    const columns = ['runtime_id', 'event_type', 'provider_id', 'adapter_id', 'outcome', 'occurred_at']
    const binds = columns.map((_, index) => placeholders(index + 1)).join(', ')
    const statement = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${binds})`
    return {
      async record(event) {
        const row = eventRow(event, now())
        await sql.execute(statement, [row.runtime_id, row.event_type, row.provider_id, row.adapter_id, row.outcome, row.occurred_at])
      },
    }
  }
}

/** A destination reached by one HTTP request carrying a JSON body. */
function httpSink(
  sinkId: string,
  buildRequest: (config: Readonly<Record<string, string>>, row: ReturnType<typeof eventRow>) => ActivityHttpRequest,
) {
  return (config: Readonly<Record<string, string>>, primitives: BrowserActivityPrimitives): PortableBrowserActivityPort => {
    const http = needHttp(primitives, sinkId)
    const now = clockOf(primitives)
    return {
      async record(event) {
        const request = buildRequest(config, eventRow(event, now()))
        const response = await http.send(request)
        // A 2xx is success; anything else is reported rather than swallowed. An activity sink
        // that fails quietly is worse than none, because the absence of records reads as an
        // absence of activity.
        if (!(response.status >= 200 && response.status < 300)) {
          throw new Error(`${sinkId}: destination returned HTTP ${response.status}.`)
        }
      },
    }
  }
}

const TABLE_FIELD: ActivitySinkField = {
  key: 'table',
  label: 'Table',
  required: false,
  secret: false,
  placeholder: 'portable_browser_activity',
  help: 'Optionally schema-qualified. Defaults to portable_browser_activity.',
}

// ─────────────────────────────────────────────────────────────────────────────
// The pre-staged catalog
// ─────────────────────────────────────────────────────────────────────────────
//
// Chosen to cover what a Fortune 500 and an SMB actually run, so most buyers pick rather than
// build. Everything here is data: adding a destination adds an entry, never an import.

const DECLARATIONS: BrowserActivitySinkDeclaration[] = [
  // ── Relational databases ────────────────────────────────────────────────────
  {
    id: 'postgres',
    label: 'PostgreSQL',
    category: 'sql',
    audience: 'both',
    requires: 'sql',
    fields: [TABLE_FIELD],
    notes: 'Covers self-hosted PostgreSQL, Amazon RDS/Aurora, Azure Database, Cloud SQL and Neon — anything your driver speaks $1 placeholders to.',
    build: sqlSink('postgres', 'portable_browser_activity', index => `$${index}`),
  },
  {
    id: 'mysql',
    label: 'MySQL or MariaDB',
    category: 'sql',
    audience: 'both',
    requires: 'sql',
    fields: [TABLE_FIELD],
    build: sqlSink('mysql', 'portable_browser_activity', () => '?'),
  },
  {
    id: 'sqlserver',
    label: 'Microsoft SQL Server',
    category: 'sql',
    audience: 'enterprise',
    requires: 'sql',
    fields: [TABLE_FIELD],
    build: sqlSink('sqlserver', 'portable_browser_activity', index => `@p${index}`),
  },
  {
    id: 'oracle',
    label: 'Oracle Database',
    category: 'sql',
    audience: 'enterprise',
    requires: 'sql',
    fields: [TABLE_FIELD],
    build: sqlSink('oracle', 'portable_browser_activity', index => `:${index}`),
  },
  {
    id: 'snowflake',
    label: 'Snowflake',
    category: 'sql',
    audience: 'enterprise',
    requires: 'sql',
    fields: [TABLE_FIELD],
    build: sqlSink('snowflake', 'portable_browser_activity', () => '?'),
  },

  // ── Hosted platforms with a REST table API ─────────────────────────────────
  {
    id: 'supabase',
    label: 'Supabase',
    category: 'http',
    audience: 'smb',
    requires: 'http',
    fields: [
      { key: 'url', label: 'Project URL', required: true, secret: false, placeholder: 'https://your-project.supabase.co' },
      { key: 'serviceKey', label: 'Service role key', required: true, secret: true },
      TABLE_FIELD,
    ],
    notes: 'Written over the REST endpoint, so no Supabase SDK is installed and no environment variable is read.',
    build: (config, primitives) => {
      const base = requireHttps(requireField(config, 'url', 'supabase'), 'supabase').replace(/\/+$/, '')
      const key = requireField(config, 'serviceKey', 'supabase')
      const table = requireTable(config, 'supabase', 'portable_browser_activity')
      return httpSink('supabase', (_c, row) => ({
        url: `${base}/rest/v1/${table}`,
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: key, authorization: `Bearer ${key}`, prefer: 'return=minimal' },
        body: JSON.stringify(row),
      }))(config, primitives)
    },
  },

  // ── Log and SIEM destinations ──────────────────────────────────────────────
  {
    id: 'splunk-hec',
    label: 'Splunk (HTTP Event Collector)',
    category: 'siem',
    audience: 'enterprise',
    requires: 'http',
    fields: [
      { key: 'url', label: 'HEC endpoint', required: true, secret: false, placeholder: 'https://splunk.example.com:8088/services/collector' },
      { key: 'token', label: 'HEC token', required: true, secret: true },
      { key: 'index', label: 'Index', required: false, secret: false },
      { key: 'sourcetype', label: 'Sourcetype', required: false, secret: false, placeholder: 'portable:browser:activity' },
    ],
    build: (config, primitives) => {
      const url = requireHttps(requireField(config, 'url', 'splunk-hec'), 'splunk-hec')
      const token = requireField(config, 'token', 'splunk-hec')
      return httpSink('splunk-hec', (cfg, row) => ({
        url,
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Splunk ${token}` },
        body: JSON.stringify({
          event: row,
          sourcetype: String(cfg?.sourcetype || 'portable:browser:activity'),
          ...(cfg?.index ? { index: String(cfg.index) } : {}),
        }),
      }))(config, primitives)
    },
  },
  {
    id: 'datadog-logs',
    label: 'Datadog Logs',
    category: 'siem',
    audience: 'both',
    requires: 'http',
    fields: [
      { key: 'url', label: 'Intake endpoint', required: false, secret: false, placeholder: 'https://http-intake.logs.datadoghq.com/api/v2/logs', help: 'Use your region’s intake host. Defaults to US1.' },
      { key: 'apiKey', label: 'API key', required: true, secret: true },
      { key: 'service', label: 'Service name', required: false, secret: false, placeholder: 'portable-browser' },
    ],
    build: (config, primitives) => {
      const url = requireHttps(String(config?.url || '').trim() || 'https://http-intake.logs.datadoghq.com/api/v2/logs', 'datadog-logs')
      const apiKey = requireField(config, 'apiKey', 'datadog-logs')
      return httpSink('datadog-logs', (cfg, row) => ({
        url,
        method: 'POST',
        headers: { 'content-type': 'application/json', 'dd-api-key': apiKey },
        body: JSON.stringify([{ ddsource: 'portable-browser', service: String(cfg?.service || 'portable-browser'), message: JSON.stringify(row), ...row }]),
      }))(config, primitives)
    },
  },
  {
    id: 'elasticsearch',
    label: 'Elasticsearch or OpenSearch',
    category: 'siem',
    audience: 'enterprise',
    requires: 'http',
    fields: [
      { key: 'url', label: 'Cluster URL', required: true, secret: false, placeholder: 'https://search.example.com:9200' },
      { key: 'index', label: 'Index', required: false, secret: false, placeholder: 'portable-browser-activity' },
      { key: 'apiKey', label: 'API key', required: false, secret: true, help: 'Sent as an ApiKey authorization header when supplied.' },
    ],
    build: (config, primitives) => {
      const base = requireHttps(requireField(config, 'url', 'elasticsearch'), 'elasticsearch').replace(/\/+$/, '')
      const index = String(config?.index || 'portable-browser-activity').trim()
      const apiKey = String(config?.apiKey || '').trim()
      return httpSink('elasticsearch', (_c, row) => ({
        url: `${base}/${index}/_doc`,
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `ApiKey ${apiKey}` } : {}) },
        body: JSON.stringify(row),
      }))(config, primitives)
    },
  },

  // ── Anything else the buyer already runs ───────────────────────────────────
  {
    id: 'webhook',
    label: 'Generic webhook',
    category: 'http',
    audience: 'both',
    requires: 'http',
    fields: [
      { key: 'url', label: 'Endpoint', required: true, secret: false, placeholder: 'https://internal.example.com/hooks/browser-activity' },
      { key: 'authorization', label: 'Authorization header', required: false, secret: true, help: 'Sent verbatim when supplied — Bearer, Basic, or anything your endpoint expects.' },
    ],
    notes: 'The escape hatch that makes every remaining destination reachable: queue, warehouse, internal service, or a broker your team fronts with an endpoint.',
    build: (config, primitives) => {
      const url = requireHttps(requireField(config, 'url', 'webhook'), 'webhook')
      const authorization = String(config?.authorization || '').trim()
      return httpSink('webhook', (_c, row) => ({
        url,
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) },
        body: JSON.stringify(row),
      }))(config, primitives)
    },
  },

  // ── Local, for evaluation and tests ────────────────────────────────────────
  {
    id: 'memory',
    label: 'In memory (evaluation only)',
    category: 'local',
    audience: 'both',
    requires: 'none',
    fields: [],
    notes: 'Records are held in the process and lost on restart. Useful for an acceptance run before a real destination is chosen; never a production answer.',
    build: () => {
      const recorded: PortableBrowserActivityEvent[] = []
      const port = {
        async record(event: PortableBrowserActivityEvent) {
          recorded.push(event)
        },
      } as PortableBrowserActivityPort & { recorded: PortableBrowserActivityEvent[] }
      port.recorded = recorded
      return port
    },
  },
]

const BY_ID = new Map(DECLARATIONS.map(entry => [entry.id, entry]))

// ─────────────────────────────────────────────────────────────────────────────
// The buyer-facing surface
// ─────────────────────────────────────────────────────────────────────────────

/** Every pre-staged destination, optionally narrowed for a picker. */
export function listBrowserActivitySinks(filter?: { audience?: ActivitySinkAudience; category?: ActivitySinkCategory }): BrowserActivitySinkDeclaration[] {
  return DECLARATIONS.filter(entry => {
    if (filter?.category && entry.category !== filter.category) return false
    if (filter?.audience && entry.audience !== 'both' && entry.audience !== filter.audience) return false
    return true
  })
}

export function getBrowserActivitySink(id: string): BrowserActivitySinkDeclaration | null {
  return BY_ID.get(String(id || '').trim()) || null
}

/**
 * Register a destination we have not pre-staged.
 *
 * This is the difference between a catalog and a limit: a buyer with something unusual declares
 * it the same way we declared PostgreSQL, and everything downstream — pickers, configuration
 * forms, acceptance — treats it identically. Replacing a pre-staged entry is allowed and
 * deliberate; a buyer's own PostgreSQL declaration should win over ours.
 */
export function registerBrowserActivitySink(declaration: BrowserActivitySinkDeclaration): void {
  if (!declaration?.id || !declaration?.label) throw new Error('An activity sink needs an id and a label.')
  if (typeof declaration.build !== 'function') throw new Error(`Activity sink "${declaration.id}" has no build function.`)
  BY_ID.set(declaration.id, declaration)
  const existing = DECLARATIONS.findIndex(entry => entry.id === declaration.id)
  if (existing >= 0) DECLARATIONS[existing] = declaration
  else DECLARATIONS.push(declaration)
}

/**
 * Build the port for a chosen destination.
 *
 * Returns a refusal rather than throwing, and the refusal always names what is missing —
 * a field, a primitive, or the destination itself. "Activity is not being recorded" with no
 * reason is how a buyer discovers six months later that nothing was ever written.
 */
export function createBrowserActivitySink(
  id: string,
  config: Readonly<Record<string, string>> = {},
  primitives: BrowserActivityPrimitives = {},
): ActivitySinkResult {
  const declaration = getBrowserActivitySink(id)
  if (!declaration) {
    return { ok: false, reason: `Unknown activity destination "${id}". Choose one of: ${DECLARATIONS.map(entry => entry.id).join(', ')} — or register your own.` }
  }
  const missing = declaration.fields.filter(field => field.required && !String(config?.[field.key] ?? '').trim()).map(field => field.key)
  if (missing.length) {
    return { ok: false, reason: `${declaration.label} needs ${missing.join(', ')}.` }
  }
  try {
    return { ok: true, port: declaration.build(config, primitives), sinkId: declaration.id }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}
