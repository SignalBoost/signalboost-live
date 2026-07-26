import type { AndroidPlayConsoleReleaseEvidenceManifest } from './android-play-console-release-evidence.ts'
import type { AndroidPublicationEvidenceReport } from './android-publication-evidence.ts'

export const ANDROID_PUBLICATION_DECISION_SCHEMA_VERSION = 'signalboost-android-publication-decision-v1' as const

export type AndroidPublicationDecisionBlocker =
  | 'publication-evidence'
  | 'release-evidence'
  | 'identity'
  | 'digest-linkage'
  | 'release-track'
  | 'review-status'
  | 'decision-reference'
  | 'decision-timestamp'
  | 'unsafe-material'
  | 'unsafe-state'

export interface AndroidPublicationDecisionInput {
  publicationEvidence: AndroidPublicationEvidenceReport
  releaseEvidence: AndroidPlayConsoleReleaseEvidenceManifest
  decision: 'approve' | 'hold'
  decisionReference: string
  decidedAt: string
  artifactAccessed: false
  artifactUploaded: false
  playConsoleApiCalled: false
  releaseCreated: false
  rolloutStarted: false
  productionPublished: false
  productionExecutionEnabled: false
}

export interface AndroidPublicationDecisionManifest {
  schemaVersion: typeof ANDROID_PUBLICATION_DECISION_SCHEMA_VERSION
  portableId: string
  packageName: string
  versionCode: number
  versionName: string
  releaseTrack: string
  signedAabSha256: string
  decision: 'approve' | 'hold' | 'blocked'
  state: 'publication_approved' | 'publication_held' | 'blocked'
  blockers: readonly AndroidPublicationDecisionBlocker[]
  readOnly: true
  artifactAccessed: false
  artifactUploaded: false
  playConsoleApiCalled: false
  releaseCreated: false
  rolloutStarted: false
  productionPublished: false
  productionExecutionEnabled: false
}

const SHA256 = /^[0-9a-f]{64}$/
const REFERENCE = /^[a-z][a-z0-9+.-]*:[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+$/
const UNSAFE = /BEGIN\s|PRIVATE\s+KEY|password|secret=|token=|service[_-]?account|access[_-]?token/i

function validReference(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 && REFERENCE.test(value) && !value.includes('..') && !UNSAFE.test(value)
}

function validDate(value: unknown): boolean {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

export function createAndroidPublicationDecision(inputValue: unknown): AndroidPublicationDecisionManifest {
  const input = inputValue as Partial<AndroidPublicationDecisionInput> | null
  const publication = input?.publicationEvidence as Partial<AndroidPublicationEvidenceReport> | undefined
  const release = input?.releaseEvidence as Partial<AndroidPlayConsoleReleaseEvidenceManifest> | undefined
  const blockers: AndroidPublicationDecisionBlocker[] = []

  const validPublication = Boolean(
    publication && publication.schemaVersion === 'signalboost-android-publication-evidence-v1' &&
    publication.state === 'publication_evidence_validated' && Array.isArray(publication.blockers) && publication.blockers.length === 0 &&
    publication.readOnly === true && publication.artifactAccessed === false && publication.playApiInvoked === false &&
    publication.storeMutationPerformed === false && publication.productionPublished === false && publication.productionExecutionEnabled === false,
  )
  if (!validPublication) blockers.push('publication-evidence')

  const validRelease = Boolean(
    release && release.schemaVersion === 'signalboost-android-play-console-release-evidence-v1' &&
    release.state === 'release_evidence_ready' && release.rolloutEligible === true && Array.isArray(release.blockers) && release.blockers.length === 0 &&
    release.readOnly === true && release.artifactAccessed === false && release.artifactUploaded === false &&
    release.playConsoleApiCalled === false && release.releaseCreated === false && release.rolloutStarted === false &&
    release.productionPublished === false && release.productionExecutionEnabled === false,
  )
  if (!validRelease) blockers.push('release-evidence')

  const portableId = typeof publication?.portableId === 'string' ? publication.portableId.trim() : ''
  const packageName = typeof publication?.packageName === 'string' ? publication.packageName.trim() : ''
  if (!portableId || !packageName || portableId !== release?.portableId || packageName !== release?.packageName) blockers.push('identity')

  const signedAabSha256 = typeof release?.signedAabSha256 === 'string' ? release.signedAabSha256 : ''
  if (!SHA256.test(signedAabSha256)) blockers.push('digest-linkage')

  const releaseTrack = publication?.releaseTrack
  if (!['internal', 'closed', 'open', 'production'].includes(String(releaseTrack ?? ''))) blockers.push('release-track')
  if (input?.decision === 'approve' && releaseTrack === 'production' && publication?.state !== 'publication_evidence_validated') blockers.push('review-status')

  if (!validReference(input?.decisionReference)) blockers.push('decision-reference')
  if (!validDate(input?.decidedAt)) blockers.push('decision-timestamp')
  if (typeof input?.decisionReference === 'string' && UNSAFE.test(input.decisionReference)) blockers.push('unsafe-material')
  if (input?.decision !== 'approve' && input?.decision !== 'hold') blockers.push('review-status')
  if (input?.artifactAccessed !== false || input?.artifactUploaded !== false || input?.playConsoleApiCalled !== false || input?.releaseCreated !== false || input?.rolloutStarted !== false || input?.productionPublished !== false || input?.productionExecutionEnabled !== false) blockers.push('unsafe-state')

  const safeDecision = input?.decision === 'approve' || input?.decision === 'hold' ? input.decision : 'blocked'
  const state = blockers.length > 0 ? 'blocked' : safeDecision === 'approve' ? 'publication_approved' : 'publication_held'

  return Object.freeze({
    schemaVersion: ANDROID_PUBLICATION_DECISION_SCHEMA_VERSION,
    portableId,
    packageName,
    versionCode: typeof publication?.versionCode === 'number' && Number.isSafeInteger(publication.versionCode) ? publication.versionCode : 0,
    versionName: typeof publication?.versionName === 'string' ? publication.versionName : '',
    releaseTrack: typeof releaseTrack === 'string' ? releaseTrack : '',
    signedAabSha256: SHA256.test(signedAabSha256) ? signedAabSha256 : '',
    decision: blockers.length === 0 ? safeDecision : 'blocked',
    state,
    blockers: Object.freeze(blockers),
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
