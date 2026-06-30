// saas/console-core/types.ts
//
// Portable console contracts. NOTHING in this file imports from the host app's
// business logic, DB models, or auth implementation — that is the whole point.
// A host platform satisfies these interfaces with thin adapters (see README).
//
// These types are additive: the existing console keeps working unchanged. New
// portable surfaces (registry, schema-driven UI, action engine) build on them,
// and provider handlers are migrated behind adapters incrementally — never in a
// big-bang rewrite.

/** Coarse grouping used for sidebar tiers and card accents. */
export type ProviderCategory =
  | 'infra' | 'payments' | 'db' | 'ai' | 'hosting' | 'git'
  | 'media' | 'search' | 'messaging' | 'analytics' | 'crm' | 'other'

/** A provider's live connection verdict, derived purely from env-var presence. */
export type ProviderStatus = 'connected' | 'not_connected' | 'error'

/** One environment-variable slot a provider needs. `required` slots gate status. */
export interface EnvSlot {
  /** The process.env key, e.g. "STRIPE_SECRET_KEY". */
  key: string
  /** Human label shown in setup UIs. */
  label: string
  /** Required slots must all be present for the provider to be "connected". */
  required: boolean
  /** Hint that the value is sensitive (never rendered, never returned to client). */
  secret: boolean
}

/** Field types the schema-driven form renderer understands. */
export type FieldType =
  | 'text' | 'number' | 'boolean' | 'select'
  | 'remote_select'  // single-pick dropdown sourced from a live list action
  | 'remote_list'    // multi-row collection rendered as a grid
  | 'json'

/** One input field in an action form, fully declarative (no provider-specific UI). */
export interface ActionField {
  id: string
  label: string
  type: FieldType
  required?: boolean
  /** Render in an optional advanced section when supported by the host UI. */
  advanced?: boolean
  /** Static options for `select`. */
  options?: { label: string; value: string }[]
  /**
   * For `remote_select` / `remote_list`: the list-action that supplies options.
   * Mirrors the console's existing `source` shape so current templates map 1:1.
   */
  remoteSource?: {
    action: string
    dataPath: string
    valueKey?: string
    labelTemplate?: string
    dependsOn?: string[]
    emptyHint?: string
  }
}

/** A declarative action definition. The renderer needs nothing else to draw it. */
export interface ActionSchema {
  id: string
  label: string
  description?: string
  /** One of Create/View/Edit/Archive/Delete (or a custom verb). */
  verb?: 'create' | 'view' | 'edit' | 'archive' | 'delete' | string
  fields: ActionField[]
}

/** Provider-level metadata used to render sidebar + cards with zero hard-coding. */
export interface ProviderMeta {
  id: string
  displayName: string
  tier: 1 | 2 | 3 | 4
  category: string
  accent: string
  icon: string
  envVars: EnvSlot[]
}

/**
 * The adapter a host implements to expose a provider's status and actions.
 * Status is async so a host can do live credential probes if it wants; the
 * default registry resolves it from env-var presence alone.
 */
export interface ProviderAdapter {
  meta: ProviderMeta
  getStatus(): Promise<ProviderStatus>
  getActions(): ActionSchema[]
}

// ----- Swappable host integrations (auth / logging / execution) -----

/** Identity + permission boundary. Swap for Auth0, Clerk, custom JWT, etc. */
export interface AuthAdapter {
  getCurrentUser(): Promise<{ id: string; email?: string; roles?: string[] } | null>
  hasPermission(
    user: { id: string; roles?: string[] } | null,
    providerId: string,
    actionId: string,
  ): boolean | Promise<boolean>
}

/** Audit/telemetry boundary. Swap for Datadog, Logflare, CloudWatch, etc. */
export interface LogAdapter {
  logAction(event: {
    timestamp: string
    userId?: string
    providerId: string
    actionId: string
    status: 'success' | 'error'
    inputSummary?: unknown
    errorMessage?: string
  }): Promise<void>
}

/** Context handed to every action executor. */
export interface ActionExecutionContext {
  user: { id: string; email?: string; roles?: string[] } | null
  providerId: string
  actionId: string
}

/** A provider's runtime for one action. The host's handler lives behind this. */
export type ActionExecutor = (
  ctx: ActionExecutionContext,
  input: Record<string, unknown>,
) => Promise<{ ok: boolean; message?: string; data?: unknown; error?: string }>

/** Host-supplied wiring that lets the core run without importing app internals. */
export interface ConsoleHost {
  auth: AuthAdapter
  log: LogAdapter
  /** Resolve an executor for a provider+action; returns null if unsupported. */
  resolveExecutor(providerId: string, actionId: string): ActionExecutor | null
}
