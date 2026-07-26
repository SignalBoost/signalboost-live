export const ANDROID_PACKAGING_EVIDENCE_CHAIN_SCHEMA_VERSION = 'signalboost-android-packaging-evidence-chain-v1' as const

export type AndroidPackagingEvidenceChainBlocker =
  | 'readiness'
  | 'build-evidence'
  | 'signed-bundle-evidence'
  | 'release-evidence'
  | 'publication-evidence'
  | 'production-publication-evidence'
  | 'identity'
  | 'source-commit'
  | 'digest-linkage'
  | 'release-version'
  | 'unsafe-state'

export interface AndroidPackagingEvidenceChainReport {
  schemaVersion: typeof ANDROID_PACKAGING_EVIDENCE_CHAIN_SCHEMA_VERSION
  portableId: string
  packageName: string
  sourceCommitSha: string
  unsignedAabSha256: string
  signedAabSha256: string
  versionCode: number
  versionName: string
  state: 'packaging_evidence_chain_validated' | 'blocked'
  blockers: readonly AndroidPackagingEvidenceChainBlocker[]
  phases: readonly string[]
  readOnly: true
  artifactAccessed: false
  playApiInvoked: false
  storeMutationPerformed: false
  productionExecutionEnabled: false
}

type RecordValue = Record<string, unknown>
const SHA40 = /^[0-9a-f]{40}$/
const SHA256 = /^[0-9a-f]{64}$/

function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === 'object' ? value as RecordValue : null
}

function blockerFree(value: RecordValue | null): boolean {
  return Boolean(value && Array.isArray(value.blockers) && value.blockers.length === 0)
}

export function validateAndroidPackagingEvidenceChain(inputValue: unknown): AndroidPackagingEvidenceChainReport {
  const input = record(inputValue)
  const readiness = record(input?.readiness)
  const build = record(input?.buildEvidence)
  const signed = record(input?.signedBundleEvidence)
  const release = record(input?.releaseEvidence)
  const publication = record(input?.publicationEvidence)
  const production = record(input?.productionPublicationEvidence)
  const blockers: AndroidPackagingEvidenceChainBlocker[] = []

  if (!(readiness?.schemaVersion === 'signalboost-android-publication-readiness-v1' && readiness.state === 'publication_ready' && blockerFree(readiness))) blockers.push('readiness')
  if (!(build?.schemaVersion === 'signalboost-android-build-evidence-v1' && build.state === 'build_evidence_validated' && blockerFree(build))) blockers.push('build-evidence')
  if (!(signed?.schemaVersion === 'signalboost-android-signed-bundle-evidence-v1' && signed.state === 'signed_bundle_evidence_validated' && blockerFree(signed))) blockers.push('signed-bundle-evidence')
  if (!(release?.schemaVersion === 'signalboost-android-play-console-release-evidence-v1' && release.state === 'release_evidence_ready' && release.rolloutEligible === true && blockerFree(release))) blockers.push('release-evidence')
  if (!(publication?.schemaVersion === 'signalboost-android-publication-evidence-v1' && publication.state === 'publication_evidence_validated' && blockerFree(publication))) blockers.push('publication-evidence')
  if (!(production?.schemaVersion === 'signalboost-android-production-publication-evidence-v1' && production.state === 'production_publication_evidence_validated' && blockerFree(production))) blockers.push('production-publication-evidence')

  const portableId = typeof build?.portableId === 'string' ? build.portableId : ''
  const packageName = typeof build?.packageName === 'string' ? build.packageName : ''
  const identityValues = [readiness, build, signed, release, publication, production]
  if (!portableId || !packageName || identityValues.some(value => value?.portableId !== portableId || value?.packageName !== packageName)) blockers.push('identity')

  const sourceCommitSha = typeof build?.sourceCommitSha === 'string' ? build.sourceCommitSha : ''
  if (!SHA40.test(sourceCommitSha) || signed?.sourceCommitSha !== sourceCommitSha || release?.sourceCommitSha !== sourceCommitSha) blockers.push('source-commit')

  const unsignedAabSha256 = typeof build?.unsignedAabSha256 === 'string' ? build.unsignedAabSha256 : ''
  const signedAabSha256 = typeof signed?.signedAabSha256 === 'string' ? signed.signedAabSha256 : ''
  if (!SHA256.test(unsignedAabSha256) || signed?.unsignedAabSha256 !== unsignedAabSha256 || !SHA256.test(signedAabSha256) || release?.signedAabSha256 !== signedAabSha256 || publication?.signedAabSha256 !== signedAabSha256 || production?.signedAabSha256 !== signedAabSha256) blockers.push('digest-linkage')

  const versionCode = typeof publication?.versionCode === 'number' ? publication.versionCode : 0
  const versionName = typeof publication?.versionName === 'string' ? publication.versionName : ''
  if (!Number.isSafeInteger(versionCode) || versionCode <= 0 || !versionName || production?.versionCode !== versionCode || production?.versionName !== versionName || publication?.releaseTrack !== 'production') blockers.push('release-version')

  const unsafe = identityValues.some(value => !value || value.readOnly !== true || value.artifactAccessed !== false || value.productionExecutionEnabled !== false) ||
    release?.playConsoleApiCalled !== false || release?.releaseCreated !== false || release?.rolloutStarted !== false ||
    publication?.playApiInvoked !== false || publication?.storeMutationPerformed !== false || publication?.productionPublished !== false ||
    production?.playApiInvoked !== false || production?.storeMutationPerformed !== false || production?.publishedBySignalBoost !== false
  if (unsafe) blockers.push('unsafe-state')

  return Object.freeze({
    schemaVersion: ANDROID_PACKAGING_EVIDENCE_CHAIN_SCHEMA_VERSION,
    portableId,
    packageName,
    sourceCommitSha: SHA40.test(sourceCommitSha) ? sourceCommitSha : '',
    unsignedAabSha256: SHA256.test(unsignedAabSha256) ? unsignedAabSha256 : '',
    signedAabSha256: SHA256.test(signedAabSha256) ? signedAabSha256 : '',
    versionCode: Number.isSafeInteger(versionCode) && versionCode > 0 ? versionCode : 0,
    versionName,
    state: blockers.length === 0 ? 'packaging_evidence_chain_validated' : 'blocked',
    blockers: Object.freeze(blockers),
    phases: Object.freeze(['readiness', 'build-evidence', 'signed-bundle-evidence', 'release-evidence', 'publication-evidence', 'production-publication-evidence']),
    readOnly: true,
    artifactAccessed: false,
    playApiInvoked: false,
    storeMutationPerformed: false,
    productionExecutionEnabled: false,
  })
}
