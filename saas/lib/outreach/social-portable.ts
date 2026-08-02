// saas/lib/outreach/social-portable.ts
//
// THE PORTABLE'S PUBLIC SURFACE.
//
// Everything a host needs, and deliberately nothing else. A buyer imports from here;
// anything not re-exported is internal and may change without notice, which is what
// makes it safe to keep improving the connectors after a sale.
//
// The packager (saas/scripts/build-social-portable.mjs) walks the import graph from
// this file and refuses to build if it reaches a host path or a third-party package.
// So this barrel is also the boundary: adding an export that pulls in `@/lib/...` or a
// dependency breaks the build rather than shipping a portable that only works here.

// ── Publishing ───────────────────────────────────────────────────────────────
// The connector registry, the platform union, and the publish entry point.
export {
  publishSocialPost,
  refreshSocialToken,
  buildOAuthUrl,
  platformContentKind,
  platformNeedsAccountRef,
  platformAvailableModes,
  platformDefaultMode,
  platformSupportsNativeVideo,
  ADAPTERS,
  SOCIAL_CONNECTORS,
  type SocialPlatform,
  type PublishMode,
  type SocialPostPayload,
  type SocialEngagementMetrics,
} from './social-connectors.ts'

// ── Credentials ──────────────────────────────────────────────────────────────
// The one seam a buyer must wire: where OAuth client ids and secrets come from.
// Install nothing and it reads process.env, which is the right choice for a trial.
export {
  setSocialSecretsResolver,
  getSocialSecret,
  socialCredentialNames,
  type SocialSecretsResolver,
} from './social-secrets.ts'

// ── Destinations ─────────────────────────────────────────────────────────────
// Pages, channels and profiles discovered from the provider after connection.
// The layer never invents one; a platform that needs a destination refuses without it.
export {
  discoverSocialDestinations,
  type SocialDestination,
} from './social-destinations.ts'

// ── Tokens ───────────────────────────────────────────────────────────────────
// Reads and refreshes the stored OAuth token. Takes the host's datastore client as its
// first argument — the layer opens no connection of its own.
export {
  getValidSocialToken,
  type ValidSocialToken,
} from './social-token.ts'

// ── Publish mode ─────────────────────────────────────────────────────────────
// link vs native, per buyer per platform, falling back to the platform's safe default.
export { resolvePublishMode } from './publish-mode.ts'

// ── Onboarding ───────────────────────────────────────────────────────────────
// What each platform requires of the buyer before it can publish — the developer app,
// the callback URL, the credential names, and whether a business entity is needed.
// Exported because a buyer building their own setup UI needs the same facts the
// SignalBoost cockpit shows.
export {
  allSocialOnboardingGuides,
  getSocialOnboardingGuide,
  type SocialOnboardingGuide,
  type SocialOnboardingStep,
  type SocialOnboardingProviderId,
} from './social-onboarding-guide.ts'

// ── Content shape ────────────────────────────────────────────────────────────
// ── Declared platforms ───────────────────────────────────────────────────────
// Bring your own platform: a buyer registers any OAuth+REST platform as data, with no
// code change and no release. Exported because it is the answer to "do you support X?"
// for every X we do not ship an adapter for.
export {
  registerCustomPlatform,
  unregisterCustomPlatform,
  listCustomPlatforms,
  getCustomPlatform,
  isCustomPlatform,
  type CustomPlatformConfig,
  type CustomPlatformBody,
} from './social-custom-platform.ts'

export { availableSocialPlatforms } from './social-connectors.ts'

export * from './social-schema.ts'
