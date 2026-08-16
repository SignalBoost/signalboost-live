// saas/lib/portable-browser/browser-activity-supabase.ts
//
// KEPT AT ITS ORIGINAL PATH, REWRITTEN TO OBEY THE BOUNDARY.
//
// This compatibility wrapper previously depended directly on a vendor SDK and ambient
// service credentials. Both are disqualifying in a portable: the package is a dependency a
// buyer never chose, while hidden runtime configuration violates the explicit host boundary.
//
// Supabase is now ONE ENTRY IN A CATALOG rather than the way this portable records activity —
// see browser-activity-sinks.ts. It is reached over the REST endpoint through the buyer's own
// HTTP primitive, so no SDK is installed, and its project URL and key arrive as configuration a
// person supplies rather than as variables the payload goes looking for.
//
// The file remains here, with the same exported name, so nothing that already imports it
// breaks. Calling it with no configuration returns null — the same thing the old version did
// when the environment variables were absent, which is the behaviour every existing caller
// already handles.
//
// NEW WORK SHOULD NOT IMPORT THIS. Use `createBrowserActivitySink('supabase', config, ports)`,
// or better, let the buyer pick a destination from `listBrowserActivitySinks()`.

import type { PortableBrowserActivityPort } from './browser-activity-port.ts'
import { createBrowserActivitySink, type BrowserActivityPrimitives } from './browser-activity-sinks.ts'

export interface SupabaseActivitySinkConfig {
  /** The project URL. Must be https. */
  url: string
  /** The service role key. Supplied by the buyer; never read from the environment. */
  serviceKey: string
  /** Defaults to portable_browser_activity. */
  table?: string
}

/**
 * Build a Supabase-backed activity port from explicit configuration.
 *
 * @deprecated Prefer `createBrowserActivitySink('supabase', …)`, which is the same code path
 * and gives you every other destination for free. This wrapper exists so existing imports keep
 * working through the transition.
 *
 * Returns null when configuration or the HTTP primitive is missing, rather than throwing —
 * matching the old behaviour, where absent environment variables produced a null port.
 */
export function createSupabasePortableBrowserActivityPort(
  config?: SupabaseActivitySinkConfig | null,
  primitives?: BrowserActivityPrimitives,
): PortableBrowserActivityPort | null {
  if (!config?.url || !config?.serviceKey) return null
  const result = createBrowserActivitySink(
    'supabase',
    { url: config.url, serviceKey: config.serviceKey, ...(config.table ? { table: config.table } : {}) },
    primitives ?? {},
  )
  return result.ok ? result.port : null
}
