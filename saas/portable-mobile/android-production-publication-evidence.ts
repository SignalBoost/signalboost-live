export const ANDROID_PRODUCTION_PUBLICATION_EVIDENCE_SCHEMA_VERSION = 'signalboost-android-production-publication-evidence-v1' as const

export type AndroidProductionPublicationEvidenceBlocker =
  | 'release-evidence'
  | 'publication-evidence'
  | 'identity'
  | 'release-version'
  | 'release-track'
  | 'digest-linkage'
  | 'review-status'
  | 'rollout'
  | 'country-scope'
  | 'publication-references'
  | 'timestamps'
  | 'unsafe-material'
  | 'unsafe-state'

export interface AndroidProductionPublicationEvidenceInput {
  releaseEvidence: unknown
  publicationEvidence: unknown
  portableId: string
  packageName: string
  versionCode: number
  versionName: string
  signedAabSha256: string
  releaseTrack: 'production'
  reviewStatus: 'approved'
  rolloutPercentage: 100
  countryCodes: readonly string[]
  publicListingReference: string
  publicationOutcomeReference: string
  publishedAt: string
  verifiedAt: string
  artifactAccessed: false
  artifactUploadedBySignalBoost: false
  playApiInvokedBySignalBoost: false
  rolloutMutatedBySignalBoost: false
  publishedBySignalBoost: false
  deploymentPerformedBySignalBoost: false
  productionExecutionEnabled: false
}

export interface AndroidProductionPublicationEvidenceReport {
  schemaVersion: typeof ANDROID_PRODUCTION_PUBLICATION_EVIDENCE_SCHEMA_VERSION
  portableId: string
  packageName: string
  versionCode: number
  versionName: string
  signedAabSha256: string
  state: 'production_publication_evidence_validated' | 'blocked'
  blockers: readonly AndroidProductionPublicationEvidenceBlocker[]
  countryCodes: readonly string[]
  evidenceReferences: Readonly<{ publicListing: string; publicationOutcome: string }>
  readOnly: true
  liveStoreNetworkVerified: false
  artifactAccessed: false
  playApiInvoked: false
  storeMutationPerformed: false
  publishedBySignalBoost: false
  productionExecutionEnabled: false
}

const SHA256 = /^[0-9a-f]{64}$/
const PACKAGE_NAME = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/
const VERSION_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const REFERENCE = /^[a-z][a-z0-9+.-]*:\/\/[A-Za-z0-9._~!$&'()*+,;=:@%\/?#\[\]-]+$/
const COUNTRY = /^[A-Z]{2}$/
const UNSAFE = /BEGIN\s|PRIVATE\s+KEY|client_email|private_key|access[_-]?token|bearer\s|password|secret=|service[_-]?account/i

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : null
}

function validReference(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 && REFERENCE.test(value) && !value.includes('..') && !value.includes('@') && !UNSAFE.test(value)
}

function validDate(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function validateAndroidProductionPublicationEvidence(inputValue: unknown): AndroidProductionPublicationEvidenceReport {
  const input = record(inputValue)
  const release = record(input?.releaseEvidence)
  const publication = record(input?.publicationEvidence)
  const blockers: AndroidProductionPublicationEvidenceBlocker[] = []

  const validRelease = Boolean(
    release &&
    release.schemaVersion === 'signalboost-android-play-console-release-evidence-v1' &&
    release.state === 'release_evidence_ready' &&
    Array.isArray(release.blockers) && release.blockers.length === 0 &&
    release.rolloutEligible === true && release.readOnly === true &&
    release.artifactAccessed === false && release.artifactUploaded === false &&
    release.playConsoleApiCalled === false && release.releaseCreated === false &&
    release.rolloutStarted === false && release.productionPublished === false &&
    release.productionExecutionEnabled === false,
  )
  if (!validRelease) blockers.push('release-evidence')

  const validPublication = Boolean(
    publication &&
    publication.schemaVersion === 'signalboost-android-publication-evidence-v1' &&
    publication.state === 'publication_evidence_validated' &&
    Array.isArray(publication.blockers) && publication.blockers.length === 0 &&
    publication.readOnly === true && publication.artifactAccessed === false &&
    publication.playApiInvoked === false && publication.storeMutationPerformed === false &&
    publication.productionPublished === false && publication.productionExecutionEnabled === false,
  )
  if (!validPublication) blockers.push('publication-evidence')

  const portableId = typeof input?.portableId === 'string' ? input.portableId.trim() : ''
  const packageName = typeof input?.packageName === 'string' ? input.packageName.trim() : ''
  if (!portableId || !PACKAGE_NAME.test(packageName) || portableId !== release?.portableId || portableId !== publication?.portableId || packageName !== release?.packageName || packageName !== publication?.packageName) blockers.push('identity')

  const versionCode = input?.versionCode
  const versionName = typeof input?.versionName === 'string' ? input.versionName.trim() : ''
  if (typeof versionCode !== 'number' || !Number.isSafeInteger(versionCode) || versionCode <= 0 || !VERSION_NAME.test(versionName) || versionCode !== publication?.versionCode || versionName !== publication?.versionName) blockers.push('release-version')
  if (input?.releaseTrack !== 'production' || publication?.releaseTrack !== 'production') blockers.push('release-track')

  const signedAabSha256 = typeof input?.signedAabSha256 === 'string' ? input.signedAabSha256 : ''
  if (!SHA256.test(signedAabSha256) || signedAabSha256 !== release?.signedAabSha256) blockers.push('digest-linkage')
  if (input?.reviewStatus !== 'approved') blockers.push('review-status')
  if (input?.rolloutPercentage !== 100) blockers.push('rollout')

  const countries = input?.countryCodes
  const validCountries = Array.isArray(countries) && countries.length > 0 && countries.every(code => typeof code === 'string' && COUNTRY.test(code)) && new Set(countries).size === countries.length
  if (!validCountries) blockers.push('country-scope')

  const publicListing = input?.publicListingReference
  const publicationOutcome = input?.publicationOutcomeReference
  if (!validReference(publicListing) || !validReference(publicationOutcome)) blockers.push('publication-references')
  if ([publicListing, publicationOutcome].some(value => typeof value === 'string' && UNSAFE.test(value))) blockers.push('unsafe-material')

  const published = validDate(input?.publishedAt)
  const verified = validDate(input?.verifiedAt)
  if (published === null || verified === null || verified < published) blockers.push('timestamps')

  if (
    input?.artifactAccessed !== false ||
    input?.artifactUploadedBySignalBoost !== false ||
    input?.playApiInvokedBySignalBoost !== false ||
    input?.rolloutMutatedBySignalBoost !== false ||
    input?.publishedBySignalBoost !== false ||
    input?.deploymentPerformedBySignalBoost !== false ||
    input?.productionExecutionEnabled !== false
  ) blockers.push('unsafe-state')

  return Object.freeze({
    schemaVersion: ANDROID_PRODUCTION_PUBLICATION_EVIDENCE_SCHEMA_VERSION,
    portableId,
    packageName,
    versionCode: typeof versionCode === 'number' && Number.isSafeInteger(versionCode) && versionCode > 0 ? versionCode : 0,
    versionName: VERSION_NAME.test(versionName) ? versionName : '',
    signedAabSha256: SHA256.test(signedAabSha256) ? signedAabSha256 : '',
    state: blockers.length === 0 ? 'production_publication_evidence_validated' : 'blocked',
    blockers: Object.freeze(blockers),
    countryCodes: Object.freeze(validCountries ? [...countries].sort() : []),
    evidenceReferences: Object.freeze({
      publicListing: validReference(publicListing) ? publicListing : '',
      publicationOutcome: validReference(publicationOutcome) ? publicationOutcome : '',
    }),
    readOnly: true,
    liveStoreNetworkVerified: false,
    artifactAccessed: false,
    playApiInvoked: false,
    storeMutationPerformed: false,
    publishedBySignalBoost: false,
    productionExecutionEnabled: false,
  })
}
