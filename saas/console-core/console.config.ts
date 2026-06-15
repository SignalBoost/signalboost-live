// saas/console-core/console.config.ts
//
// The ONE file a host platform edits to integrate the console. It selects which
// providers are enabled, optionally remaps env-var names, and picks the auth /
// logging adapters. Nothing here references app-specific business logic.

/** Host configuration for the portable console. */
export interface ConsoleConfig {
  /**
   * Which providers (by id from provider-map.json) are enabled.
   * `'*'` enables every provider in the map.
   */
  enabledProviders: string[] | '*'
  /**
   * Optional per-provider env-var remapping. If a host stores Stripe's key under
   * a different name, map the canonical key -> the host's key here. The registry
   * reads the host name when resolving status.
   *   { stripe: { STRIPE_SECRET_KEY: 'MY_STRIPE_KEY' } }
   */
  envRemap?: Record<string, Record<string, string>>
  /** Which auth adapter the host wired (informational; host supplies the impl). */
  authAdapter: 'default' | 'auth0' | 'clerk' | 'custom-jwt' | string
  /** Which log adapter the host wired. */
  logAdapter: 'default' | 'datadog' | 'logflare' | 'cloudwatch' | string
  /** Hide providers whose required env vars are absent, instead of greying them. */
  hideDisconnected?: boolean
}

/**
 * Default config for THIS host (SignalBoost). Other companies replace this file.
 * Everything is enabled; the cards self-grey based on env-var presence.
 */
export const consoleConfig: ConsoleConfig = {
  enabledProviders: '*',
  envRemap: {},
  authAdapter: 'default',
  logAdapter: 'default',
  hideDisconnected: false,
}
