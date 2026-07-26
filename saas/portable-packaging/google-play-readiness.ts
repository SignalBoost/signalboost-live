export const GOOGLE_PLAY_READINESS_SCHEMA_VERSION = 'signalboost-google-play-readiness-v1' as const

export type AndroidPackagingMode = 'trusted-web-activity' | 'capacitor'
export type ReadinessStatus = 'ready' | 'blocked'

export interface GooglePlayPortableInput {
  portableId: string
  displayName: string
  startUrl: string
  packagingMode: AndroidPackagingMode
  hasInteractiveFunctionality: boolean
  hasBackNavigation: boolean
  hasPrivacyPolicy: boolean
  hasSupportContact: boolean
  hasAppIcon: boolean
  hasFeatureGraphic: boolean
  hasScreenshots: boolean
  hasContentRatingAnswers: boolean
  hasDataSafetyAnswers: boolean
  manifestUrl?: string
  serviceWorkerEnabled?: boolean
  assetLinksUrl?: string
  capacitorConfigPath?: string
  signingKeyReference?: string
  releaseEvidenceReferences?: readonly string[]
}

export type GooglePlayReadinessCheckId =
  | 'identity'
  | 'start-url'
  | 'interactive-functionality'
  | 'back-navigation'
  | 'privacy-policy'
  | 'support-contact'
  | 'store-assets'
  | 'content-rating'
  | 'data-safety'
  | 'wrapper-contract'
  | 'signing-reference'
  | 'release-evidence'

export interface GooglePlayReadinessCheck {
  id: GooglePlayReadinessCheckId
  passed: boolean
  reason: string
}

export interface GooglePlayReadinessReport {
  schemaVersion: typeof GOOGLE_PLAY_READINESS_SCHEMA_VERSION
  portableId: string
  displayName: string
  packagingMode: AndroidPackagingMode
  status: ReadinessStatus
  checks: readonly GooglePlayReadinessCheck[]
  blockers: readonly GooglePlayReadinessCheckId[]
  readOnly: true
  appBundleGenerated: false
  signingEnabled: false
  storeSubmissionEnabled: false
  deploymentEnabled: false
  productionExecutionEnabled: false
}

function nonEmpty(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function secureUrl(value: string | undefined): boolean {
  if (!nonEmpty(value)) return false
  try {
    return new URL(value as string).protocol === 'https:'
  } catch {
    return false
  }
}

function check(id: GooglePlayReadinessCheckId, passed: boolean, reason: string): GooglePlayReadinessCheck {
  return Object.freeze({ id, passed, reason })
}

export function assessGooglePlayReadiness(input: GooglePlayPortableInput): GooglePlayReadinessReport {
  if (!input || typeof input !== 'object') throw new Error('Google Play readiness input is required')

  const wrapperReady = input.packagingMode === 'trusted-web-activity'
    ? secureUrl(input.manifestUrl) && input.serviceWorkerEnabled === true && secureUrl(input.assetLinksUrl)
    : nonEmpty(input.capacitorConfigPath)

  const checks = Object.freeze([
    check('identity', nonEmpty(input.portableId) && nonEmpty(input.displayName), 'Portable identity and display name are required.'),
    check('start-url', secureUrl(input.startUrl), 'The portable start URL must be a valid HTTPS URL.'),
    check('interactive-functionality', input.hasInteractiveFunctionality === true, 'The portable must provide real interactive functionality.'),
    check('back-navigation', input.hasBackNavigation === true, 'Android users must have a deterministic back-navigation path.'),
    check('privacy-policy', input.hasPrivacyPolicy === true, 'A public privacy policy is required.'),
    check('support-contact', input.hasSupportContact === true, 'A support contact is required for the store listing.'),
    check('store-assets', input.hasAppIcon === true && input.hasFeatureGraphic === true && input.hasScreenshots === true, 'App icon, feature graphic, and screenshots are required.'),
    check('content-rating', input.hasContentRatingAnswers === true, 'Content-rating answers must be prepared.'),
    check('data-safety', input.hasDataSafetyAnswers === true, 'Data-safety answers must be prepared and evidence-based.'),
    check('wrapper-contract', wrapperReady, input.packagingMode === 'trusted-web-activity'
      ? 'TWA requires an HTTPS web manifest, active service worker, and HTTPS Digital Asset Links URL.'
      : 'Capacitor packaging requires a declared configuration path.'),
    check('signing-reference', nonEmpty(input.signingKeyReference), 'An opaque signing-key reference is required; raw signing material is forbidden.'),
    check('release-evidence', Array.isArray(input.releaseEvidenceReferences) && input.releaseEvidenceReferences.length > 0 && input.releaseEvidenceReferences.every(nonEmpty), 'At least one release-evidence reference is required.'),
  ])

  const blockers = Object.freeze(checks.filter(item => !item.passed).map(item => item.id))

  return Object.freeze({
    schemaVersion: GOOGLE_PLAY_READINESS_SCHEMA_VERSION,
    portableId: input.portableId.trim(),
    displayName: input.displayName.trim(),
    packagingMode: input.packagingMode,
    status: blockers.length === 0 ? 'ready' : 'blocked',
    checks,
    blockers,
    readOnly: true,
    appBundleGenerated: false,
    signingEnabled: false,
    storeSubmissionEnabled: false,
    deploymentEnabled: false,
    productionExecutionEnabled: false,
  })
}
