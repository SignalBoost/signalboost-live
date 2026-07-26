import type { AndroidBuildEvidenceReport } from './android-build-evidence.ts'

export const ANDROID_PUBLICATION_READINESS_SCHEMA_VERSION = 'signalboost-android-publication-readiness-v1' as const

export type AndroidPublicationBlocker =
  | 'build-evidence'
  | 'release-signing-evidence'
  | 'data-safety-evidence'
  | 'content-rating-evidence'
  | 'privacy-policy-evidence'
  | 'support-contact-evidence'
  | 'store-listing-evidence'
  | 'device-testing-evidence'
  | 'unsafe-state'

export interface AndroidPublicationReadinessInput {
  buildEvidence: AndroidBuildEvidenceReport
  releaseSigningEvidenceRef?: string
  dataSafetyEvidenceRef?: string
  contentRatingEvidenceRef?: string
  privacyPolicyEvidenceRef?: string
  supportContactEvidenceRef?: string
  storeListingEvidenceRef?: string
  deviceTestingEvidenceRef?: string
  artifactAccessed: false
  signingExecuted: false
  storeSubmissionExecuted: false
  productionPublished: false
  productionExecutionEnabled: false
}

export interface AndroidPublicationReadinessManifest {
  schemaVersion: typeof ANDROID_PUBLICATION_READINESS_SCHEMA_VERSION
  portableId: string
  packageName: string
  state: 'publication_ready' | 'blocked'
  blockers: readonly AndroidPublicationBlocker[]
  evidenceReferences: Readonly<Record<string, string>>
  readOnly: true
  artifactAccessed: false
  signingExecuted: false
  storeSubmissionExecuted: false
  productionPublished: false
  productionExecutionEnabled: false
}

const REFERENCE = /^[a-z][a-z0-9+.-]*:\/\/[A-Za-z0-9._~!$&'()*+,;=:@%\/-]+$/

function validReference(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 512 && REFERENCE.test(value) && !value.includes('..') && !value.includes('@')
}

export function createAndroidPublicationReadiness(input: AndroidPublicationReadinessInput): AndroidPublicationReadinessManifest {
  if (!input || typeof input !== 'object') throw new Error('publication readiness input is required')

  const blockers: AndroidPublicationBlocker[] = []
  const evidence = input.buildEvidence
  if (!evidence || evidence.schemaVersion !== 'signalboost-android-build-evidence-v1' || evidence.state !== 'evidence_validated' || evidence.blockers.length !== 0) blockers.push('build-evidence')

  const references = {
    releaseSigning: input.releaseSigningEvidenceRef,
    dataSafety: input.dataSafetyEvidenceRef,
    contentRating: input.contentRatingEvidenceRef,
    privacyPolicy: input.privacyPolicyEvidenceRef,
    supportContact: input.supportContactEvidenceRef,
    storeListing: input.storeListingEvidenceRef,
    deviceTesting: input.deviceTestingEvidenceRef,
  } as const
  const required: readonly [keyof typeof references, AndroidPublicationBlocker][] = [
    ['releaseSigning', 'release-signing-evidence'],
    ['dataSafety', 'data-safety-evidence'],
    ['contentRating', 'content-rating-evidence'],
    ['privacyPolicy', 'privacy-policy-evidence'],
    ['supportContact', 'support-contact-evidence'],
    ['storeListing', 'store-listing-evidence'],
    ['deviceTesting', 'device-testing-evidence'],
  ]
  for (const [key, blocker] of required) if (!validReference(references[key])) blockers.push(blocker)

  if (input.artifactAccessed !== false || input.signingExecuted !== false || input.storeSubmissionExecuted !== false || input.productionPublished !== false || input.productionExecutionEnabled !== false) blockers.push('unsafe-state')

  const evidenceReferences = Object.freeze(Object.fromEntries(
    Object.entries(references).filter((entry): entry is [string, string] => validReference(entry[1])).sort(([left], [right]) => left.localeCompare(right)),
  ))

  return Object.freeze({
    schemaVersion: ANDROID_PUBLICATION_READINESS_SCHEMA_VERSION,
    portableId: String(evidence?.portableId ?? '').trim(),
    packageName: String(evidence?.packageName ?? '').trim(),
    state: blockers.length === 0 ? 'publication_ready' : 'blocked',
    blockers: Object.freeze(blockers),
    evidenceReferences,
    readOnly: true,
    artifactAccessed: false,
    signingExecuted: false,
    storeSubmissionExecuted: false,
    productionPublished: false,
    productionExecutionEnabled: false,
  })
}
