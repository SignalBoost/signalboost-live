// saas/portable-mobile/provider-hub-unsigned-build-evidence-bundle.ts

export const PROVIDER_HUB_UNSIGNED_BUILD_EVIDENCE_BUNDLE_SCHEMA_VERSION = 'signalboost-provider-hub-unsigned-build-evidence-bundle-v1' as const

const SHA40 = /^[0-9a-f]{40}$/
const SHA256 = /^[0-9a-f]{64}$/
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+\.aab$/
const SAFE_VALUE = /^(?!.*(?:password|secret|token|credential|private[_ -]?key|bearer\s|@|\.\.))[A-Za-z0-9._:/+-]+$/i
const EXPECTED_KEYS = ['assetDigests', 'buildLogDigest', 'buildPlanSchemaVersion', 'dependencyLockDigest', 'dependencyReview', 'evidence', 'lintPassed', 'packageName', 'productionExecutionEnabled', 'provenanceSchemaVersion', 'repositories', 'scaffoldSchemaVersion', 'signingEnabled', 'sourceCommitSha', 'testsPassed', 'toolchain', 'unsignedAabPath', 'unsignedAabSha256', 'uploadEnabled', 'publicationEnabled'] as const
const ASSET_KEYS = ['assetLinksTemplate', 'icon', 'manifest', 'maskableIcon', 'offlinePage', 'serviceWorker'] as const
const APPROVED_REPOSITORIES = ['google', 'mavenCentral'] as const
const PACKAGE_NAME = 'com.signalboost.providerhub' as const

export interface ProviderHubUnsignedBuildEvidenceBundleInput {
  sourceCommitSha: string
  packageName: string
  scaffoldSchemaVersion: string
  buildPlanSchemaVersion: string
  provenanceSchemaVersion: string
  dependencyReview: Readonly<{ schemaVersion: string; reviewId: string; state: string; packageName: string; portableId: string; blockers: readonly string[] }>
  assetDigests: Readonly<Record<string, string>>
  toolchain: Readonly<{ jdk: string; androidSdk: string; gradle: string; androidGradlePlugin: string; androidBrowserHelper: string }>
  repositories: readonly string[]
  lintPassed: boolean
  testsPassed: boolean
  unsignedAabPath: string
  unsignedAabSha256: string
  buildLogDigest: string
  dependencyLockDigest: string
  evidence: Readonly<Record<string, string>>
  signingEnabled: boolean
  uploadEnabled: boolean
  publicationEnabled: boolean
  productionExecutionEnabled: boolean
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5
  for (const char of value) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function createProviderHubUnsignedBuildEvidenceBundle(inputValue: unknown) {
  const input = inputValue && typeof inputValue === 'object' ? inputValue as Record<string, unknown> : {}
  const blockers: string[] = []
  const keys = Object.keys(input).sort()
  if (keys.length !== EXPECTED_KEYS.length || keys.some((key, index) => key !== [...EXPECTED_KEYS].sort()[index])) blockers.push('evidence-keys')
  if (!SHA40.test(String(input.sourceCommitSha ?? ''))) blockers.push('source-commit')
  if (input.packageName !== PACKAGE_NAME) blockers.push('package-identity')
  if (input.scaffoldSchemaVersion !== 'signalboost-android-scaffold-v1' || input.buildPlanSchemaVersion !== 'signalboost-android-build-plan-v1' || input.provenanceSchemaVersion !== 'signalboost-provider-hub-unsigned-build-provenance-v1') blockers.push('schema-identity')

  const review = input.dependencyReview && typeof input.dependencyReview === 'object' ? input.dependencyReview as Record<string, unknown> : {}
  if (review.schemaVersion !== 'signalboost-provider-hub-dependency-review-v1' || review.state !== 'review_ready' || review.packageName !== PACKAGE_NAME || review.portableId !== 'provider-hub' || !Array.isArray(review.blockers) || review.blockers.length !== 0 || typeof review.reviewId !== 'string' || !SAFE_VALUE.test(review.reviewId)) blockers.push('dependency-review')

  const assets = input.assetDigests && typeof input.assetDigests === 'object' ? input.assetDigests as Record<string, unknown> : {}
  const assetKeys = Object.keys(assets).sort()
  if (assetKeys.length !== ASSET_KEYS.length || assetKeys.some((key, index) => key !== [...ASSET_KEYS].sort()[index]) || Object.values(assets).some(value => typeof value !== 'string' || !SHA256.test(value))) blockers.push('asset-digests')

  const toolchain = input.toolchain && typeof input.toolchain === 'object' ? input.toolchain as Record<string, unknown> : {}
  if (['jdk', 'androidSdk', 'gradle', 'androidGradlePlugin', 'androidBrowserHelper'].some(key => typeof toolchain[key] !== 'string' || !SAFE_VALUE.test(String(toolchain[key])) || /latest|snapshot|\+/.test(String(toolchain[key])))) blockers.push('toolchain')

  const repositories = Array.isArray(input.repositories) ? input.repositories : []
  if (repositories.length !== APPROVED_REPOSITORIES.length || repositories.some(value => typeof value !== 'string' || !APPROVED_REPOSITORIES.includes(value as typeof APPROVED_REPOSITORIES[number])) || new Set(repositories).size !== repositories.length) blockers.push('repositories')
  if (input.lintPassed !== true || input.testsPassed !== true) blockers.push('verification-results')
  if (!SAFE_PATH.test(String(input.unsignedAabPath ?? ''))) blockers.push('artifact-path')
  if (!SHA256.test(String(input.unsignedAabSha256 ?? '')) || !SHA256.test(String(input.buildLogDigest ?? '')) || !SHA256.test(String(input.dependencyLockDigest ?? ''))) blockers.push('digests')

  const evidence = input.evidence && typeof input.evidence === 'object' ? input.evidence as Record<string, unknown> : {}
  const evidenceKeys = Object.keys(evidence)
  if (evidenceKeys.length === 0 || new Set(evidenceKeys).size !== evidenceKeys.length || evidenceKeys.some(key => !SAFE_VALUE.test(key) || typeof evidence[key] !== 'string' || !SHA256.test(evidence[key] as string))) blockers.push('evidence-index')
  if (/password|secret|token|credential|private[_ -]?key|bearer\s/i.test(canonical(input))) blockers.push('credential-shaped-value')
  if (input.signingEnabled !== false || input.uploadEnabled !== false || input.publicationEnabled !== false || input.productionExecutionEnabled !== false) blockers.push('unsafe-state')

  const sorted = Object.freeze([...new Set(blockers)].sort())
  const normalizedEvidence = Object.freeze(Object.fromEntries(Object.entries(evidence).sort(([a], [b]) => a.localeCompare(b))))
  const evidenceId = `provider-hub:unsigned-build-evidence:${fnv1a(canonical({ ...input, evidence: normalizedEvidence, repositories: [...repositories].sort() }))}`
  return Object.freeze({
    schemaVersion: PROVIDER_HUB_UNSIGNED_BUILD_EVIDENCE_BUNDLE_SCHEMA_VERSION,
    evidenceId,
    state: sorted.length === 0 ? 'evidence_ready' : 'blocked',
    blockers: sorted,
    sourceCommitSha: SHA40.test(String(input.sourceCommitSha ?? '')) ? input.sourceCommitSha : '',
    packageName: PACKAGE_NAME,
    evidence: normalizedEvidence,
    readOnly: true,
    filesystemAccessed: false,
    networkAccessed: false,
    buildExecuted: false,
    dependencyResolutionPerformed: false,
    signingEnabled: false,
    uploadEnabled: false,
    publicationEnabled: false,
    productionExecutionEnabled: false,
  })
}
