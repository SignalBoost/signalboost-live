// saas/lib/outreach/social-secrets.ts
//
// THE ONE HOST COUPLING IN THE SOCIAL CONNECTOR LAYER.
//
// The connectors were already close to portable: social-destinations.ts, social-schema.ts
// and social-onboarding-guide.ts read no environment and touch no database at all, and
// social-token.ts and publish-mode.ts already receive their datastore client as a
// parameter. The single thing welding the layer to this host was credential lookup —
// two `process.env[...]` reads inside social-connectors.ts for the OAuth client id and
// secret of each platform.
//
// That matters commercially, not just architecturally. A buyer's client id and secret
// are exactly the values their security team will refuse to put in a deployment
// environment variable: they belong in the buyer's own vault (AWS Secrets Manager,
// Azure Key Vault, HashiCorp Vault, GCP Secret Manager, or their existing internal
// service). Reading them from process.env forces a policy exception before the product
// can even be trialled.
//
// So it becomes a resolver the host installs. The default reads process.env, which is
// exactly the behaviour this deployment had before — nothing changes for SignalBoost.
// A buyer calls setSocialSecretsResolver once at startup and every connector, every
// OAuth URL and every token refresh reads from their vault instead, with no edit to
// any connector.
//
// Same shape as console-core/secrets.ts, deliberately: one pattern for the whole
// product rather than a per-portable invention.

/**
 * Resolve a named credential. Return undefined (not an empty string) when the name is
 * unknown, so a missing credential is distinguishable from one deliberately set blank.
 *
 * Synchronous on purpose. It is called inside OAuth URL construction and request
 * signing, which are themselves synchronous; a buyer whose vault is async should
 * pre-load the handful of SOCIAL_* values at startup and serve them from memory. That
 * is also the right operational shape — a vault round trip per outbound request would
 * add latency and a failure mode to every publish.
 */
export type SocialSecretsResolver = (name: string) => string | undefined

const defaultResolver: SocialSecretsResolver = (name) => process.env[name]

let resolver: SocialSecretsResolver = defaultResolver

/**
 * Install the host's credential source. Call once at startup, before any connector is
 * used. Passing null restores the environment-variable default, which is what the
 * tests and the SignalBoost deployment rely on.
 */
export function setSocialSecretsResolver(next: SocialSecretsResolver | null): void {
  resolver = next || defaultResolver
}

/** Read a credential through whichever resolver the host installed. */
export function getSocialSecret(name: string): string | undefined {
  try {
    const value = resolver(name)
    return typeof value === 'string' && value.length ? value : undefined
  } catch {
    // A buyer's vault throwing must not take down a publish path with an opaque error.
    // An unresolvable credential is reported by the caller as "not configured", which
    // is the same, honest outcome as a missing environment variable.
    return undefined
  }
}

/**
 * The credential names for a platform, in the connector's uniform convention.
 * Exposed so a host can pre-load exactly the values it needs, and so the readiness
 * checks and the onboarding guide name the same keys the connectors actually read.
 */
export function socialCredentialNames(platform: string): { clientId: string; clientSecret: string } {
  const upper = String(platform || '').toUpperCase()
  return { clientId: `SOCIAL_${upper}_CLIENT_ID`, clientSecret: `SOCIAL_${upper}_CLIENT_SECRET` }
}
