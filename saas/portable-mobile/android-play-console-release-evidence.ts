import type { AndroidPublicationReadinessManifest } from './android-publication-readiness.ts'
import type { AndroidSignedBundleEvidenceReport } from './android-signed-bundle-evidence.ts'

export const ANDROID_PLAY_CONSOLE_RELEASE_EVIDENCE_SCHEMA_VERSION = 'signalboost-android-play-console-release-evidence-v1' as const

export type AndroidPlayConsoleReleaseBlocker =
  | 'signed-bundle-evidence'
  | 'publication-readiness'
  | 'identity'
  | 'internal-testing-evidence'
  | 'closed-testing-evidence'
  | 'open-testing-evidence'
  | 'rollout-eligibility-evidence'
  | 'unsafe-state'

export interface AndroidPlayConsoleReleaseEvidenceInput {
  signedBundleEvidence: AndroidSignedBundleEvidenceReport
  publicationReadiness: AndroidPublicationReadinessManifest
  internalTestingEvidenceRef?: string
  closedTestingEvidenceRef?: string
  openTestingEvidenceRef?: string
  rolloutEligibilityEvidenceRef?: string
  artifactAccessed: false
  artifactUploaded: false
  playConsoleApiCalled: false
  releaseCreated: false
  rolloutStarted: false
  productionPublished: false
  productionExecutionEnabled: false
}

export interface AndroidPlayConsoleReleaseEvidenceManifest {
  schemaVersion: typeof ANDROID_PLAY_CONSOLE_RELEASE_EVIDENCE_SCHEMA_VERSION
  portableId: string
  packageName: string
  sourceCommitSha: string
  signedAabSha256: string
  state: 'release_evidence_ready' | 'blocked'
  blockers: readonly AndroidPlayConsoleReleaseBlocker[]
  evidenceReferences: Readonly<Record<string, string>>
  rolloutEligible: boolean
  readOnly: true
  artifactAccessed: false
  artifactUploaded: false
  playConsoleApiCalled: false
  releaseCreated: false
  rolloutStarted: false
  productionPublished: false
  productionExecutionEnabled: false
}

const REFERENCE = /^[a-z][a-z0-9+.-]*:\/\/[A-Za-z0-9._~!$&'()*+,;=:@%\/-]+$/
const UNSAFE_REFERENCE = /BEGIN\s|PRIVATE\s+KEY|password|storepass|keypass|secret=|token=/i

function validReference(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 && REFERENCE.test(value) && !value.includes('..') && !value.includes('@') && !UNSAFE_REFERENCE.test(value)
}

export function createAndroidPlayConsoleReleaseEvidence(inputValue: unknown): AndroidPlayConsoleReleaseEvidenceManifest {
  const input = inputValue as Partial<AndroidPlayConsoleReleaseEvidenceInput> | null
  const signed = input?.signedBundleEvidence as Partial<AndroidSignedBundleEvidenceReport> | undefined
  const readiness = input?.publicationReadiness as Partial<AndroidPublicationReadinessManifest> | undefined
  const blockers: AndroidPlayConsoleReleaseBlocker[] = []

  const validSigned = Boolean(
    signed && signed.schemaVersion === 'signalboost-android-signed-bundle-evidence-v1' &&
    signed.state === 'signed_bundle_evidence_validated' && Array.isArray(signed.blockers) && signed.blockers.length === 0 &&
    signed.artifactAccessed === false && signed.signingPerformed === false && signed.rawSigningMaterialAccepted === false &&
    signed.storeSubmissionEnabled === false && signed.productionExecutionEnabled === false,
  )
  if (!validSigned) blockers.push('signed-bundle-evidence')

  const validReadiness = Boolean(
    readiness && readiness.schemaVersion === 'signalboost-android-publication-readiness-v1' &&
    readiness.state === 'publication_ready' && Array.isArray(readiness.blockers) && readiness.blockers.length === 0 &&
    readiness.artifactAccessed === false && readiness.signingExecuted === false && readiness.storeSubmissionExecuted === false &&
    readiness.productionPublished === false && readiness.productionExecutionEnabled === false,
  )
  if (!validReadiness) blockers.push('publication-readiness')

  const portableId = typeof signed?.portableId === 'string' ? signed.portableId.trim() : ''
  const packageName = typeof signed?.packageName === 'string' ? signed.packageName.trim() : ''
  if (!portableId || !packageName || portableId !== readiness?.portableId || packageName !== readiness?.packageName) blockers.push('identity')

  const references = {
    internalTesting: input?.internalTestingEvidenceRef,
    closedTesting: input?.closedTestingEvidenceRef,
    openTesting: input?.openTestingEvidenceRef,
    rolloutEligibility: input?.rolloutEligibilityEvidenceRef,
  } as const
  const required: readonly [keyof typeof references, AndroidPlayConsoleReleaseBlocker][] = [
    ['internalTesting', 'internal-testing-evidence'],
    ['closedTesting', 'closed-testing-evidence'],
    ['openTesting', 'open-testing-evidence'],
    ['rolloutEligibility', 'rollout-eligibility-evidence'],
  ]
  for (const [key, blocker] of required) if (!validReference(references[key])) blockers.push(blocker)

  if (input?.artifactAccessed !== false || input?.artifactUploaded !== false || input?.playConsoleApiCalled !== false || input?.releaseCreated !== false || input?.rolloutStarted !== false || input?.productionPublished !== false || input?.productionExecutionEnabled !== false) blockers.push('unsafe-state')

  const evidenceReferences = Object.freeze(Object.fromEntries(
    Object.entries(references).filter((entry): entry is [string, string] => validReference(entry[1])).sort(([left], [right]) => left.localeCompare(right)),
  ))
  const rolloutEligible = blockers.length === 0

  return Object.freeze({
    schemaVersion: ANDROID_PLAY_CONSOLE_RELEASE_EVIDENCE_SCHEMA_VERSION,
    portableId,
    packageName,
    sourceCommitSha: validSigned ? String(signed?.sourceCommitSha ?? '') : '',
    signedAabSha256: validSigned ? String(signed?.signedAabSha256 ?? '') : '',
    state: rolloutEligible ? 'release_evidence_ready' : 'blocked',
    blockers: Object.freeze(blockers),
    evidenceReferences,
    rolloutEligible,
    readOnly: true,
    artifactAccessed: false,
    artifactUploaded: false,
    playConsoleApiCalled: false,
    releaseCreated: false,
    rolloutStarted: false,
    productionPublished: false,
    productionExecutionEnabled: false,
  })
}
