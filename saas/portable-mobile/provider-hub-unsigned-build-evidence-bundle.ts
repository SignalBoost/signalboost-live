export const PROVIDER_HUB_UNSIGNED_BUILD_EVIDENCE_BUNDLE_SCHEMA_VERSION = 'signalboost-provider-hub-unsigned-build-evidence-bundle-v1' as const

const EXPECTED_INPUT_KEYS = [
  'artifactUploaded',
  'assetDigests',
  'buildLogDigest',
  'buildPlanSchemaVersion',
  'dependencyLockDigest',
  'dependencyReviewId',
  'dependencyReviewSchemaVersion',
  'evidenceIndex',
  'packageName',
  'playConsolePublished',
  'productionExecutionEnabled',
  'provenanceSchemaVersion',
  'scaffoldSchemaVersion',
  'signingEnabled',
  'sourceCommitSha',
  'toolchain',
  'unsignedAabPath',
  'unsignedAabSha256',
  'lintPassed',
  'testsPassed',
] as const

const EXPECTED_ASSET_KEYS = ['assetLinksTemplate', 'icon', 'manifest', 'maskableIcon', 'offlinePage', 'serviceWorker'] as const
const EXPECTED_EVIDENCE_KEYS = ['assets', 'build-log', 'dependency-lock', 'dependency-review', 'unsigned-aab'] as const
const SHA40 = /^[0-9a-f]{40}$/
const SHA256 = /^[0-9a-f]{64}$/
const EXACT_VERSION = /^\d+\.\d+(?:\.\d+)?(?:-[a-z0-9.-]+)?$/i
const SAFE_AAB_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[a-zA-Z0-9._/-]+\.aab$/
const SAFE_TEXT = /^(?!.*(?:credential|password|secret|token|signing|upload|publish|production execution))[a-zA-Z0-9._:/-]+$/i

export interface ProviderHubUnsignedBuildEvidenceBundleInput {
  sourceCommitSha: string
  packageName: string
  scaffoldSchemaVersion: string
  buildPlanSchemaVersion: string
  provenanceSchemaVersion: string
  dependencyReviewSchemaVersion: string
  dependencyReviewId: string
  assetDigests: Readonly<Record<'manifest' | 'serviceWorker' | 'offlinePage' | 'icon' | 'maskableIcon' | 'assetLinksTemplate', string>>
  toolchain: Readonly<{ jdk: string; androidSdk: string; gradle: string; androidGradlePlugin: string; androidBrowserHelper: string }>
  lintPassed: boolean
  testsPassed: boolean
  unsignedAabPath: string
  unsignedAabSha256: string
  buildLogDigest: string
  dependencyLockDigest: string
  evidenceIndex: readonly Readonly<{ key: string; digest: string }>[]
  signingEnabled: boolean
  artifactUploaded: boolean
  playConsolePublished: boolean
  productionExecutionEnabled: boolean
}

export interface ProviderHubUnsignedBuildEvidenceBundle {
  schemaVersion: typeof PROVIDER_HUB_UNSIGNED_BUILD_EVIDENCE_BUNDLE_SCHEMA_VERSION
  evidenceId: string
  state: 'evidence_ready' | 'blocked'
  blockers: readonly string[]
  sourceCommitSha: string
  packageName: 'com.signalboost.providerhub'
  unsignedAabPath: string
  unsignedAabSha256: string
  evidenceIndex: readonly Readonly<{ key: string; digest: string }>[]
  inputDigest: string
  filesystemAccessed: false
  networkAccessed: false
  buildExecuted: false
  dependencyResolutionPerformed: false
  signingEnabled: false
  uploadEnabled: false
  publicationEnabled: false
  productionExecutionEnabled: false
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function fnv1a(value: unknown): string {
  const text = canonical(value)
  let hash = 0x811c9dc5
  for (const char of text) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function exactKeys(value: unknown, expected: readonly string[]): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value as Record<string, unknown>).sort()
  const sortedExpected = [...expected].sort()
  return keys.length === sortedExpected.length && keys.every((key, index) => key === sortedExpected[index])
}

export function createProviderHubUnsignedBuildEvidenceBundle(input: ProviderHubUnsignedBuildEvidenceBundleInput): ProviderHubUnsignedBuildEvidenceBundle {
  if (!input || typeof input !== 'object') throw new Error('unsigned build evidence bundle input is required')

  const blockers: string[] = []
  if (!exactKeys(input, EXPECTED_INPUT_KEYS)) blockers.push('input-keys')
  if (!SHA40.test(input.sourceCommitSha)) blockers.push('source-commit')
  if (input.packageName !== 'com.signalboost.providerhub') blockers.push('package-identity')
  if (input.scaffoldSchemaVersion !== 'signalboost-android-scaffold-v1') blockers.push('scaffold-schema')
  if (input.buildPlanSchemaVersion !== 'signalboost-android-build-plan-v1') blockers.push('build-plan-schema')
  if (input.provenanceSchemaVersion !== 'signalboost-provider-hub-unsigned-build-provenance-v1') blockers.push('provenance-schema')
  if (input.dependencyReviewSchemaVersion !== 'signalboost-provider-hub-dependency-review-v1') blockers.push('dependency-review-schema')
  if (!/^dependency-review-[a-f0-9]{8}$/.test(input.dependencyReviewId)) blockers.push('dependency-review-identity')

  if (!exactKeys(input.assetDigests, EXPECTED_ASSET_KEYS) || Object.values(input.assetDigests ?? {}).some((digest) => !SHA256.test(digest))) blockers.push('asset-digests')

  const toolchain = input.toolchain ?? {} as ProviderHubUnsignedBuildEvidenceBundleInput['toolchain']
  if (!exactKeys(toolchain, ['androidBrowserHelper', 'androidGradlePlugin', 'androidSdk', 'gradle', 'jdk']) || Object.values(toolchain).some((value) => !EXACT_VERSION.test(value) || !SAFE_TEXT.test(value))) blockers.push('toolchain')
  if (input.lintPassed !== true) blockers.push('lint')
  if (input.testsPassed !== true) blockers.push('tests')
  if (!SAFE_AAB_PATH.test(input.unsignedAabPath) || !SAFE_TEXT.test(input.unsignedAabPath)) blockers.push('artifact-path')
  if (!SHA256.test(input.unsignedAabSha256)) blockers.push('artifact-digest')
  if (!SHA256.test(input.buildLogDigest)) blockers.push('build-log-digest')
  if (!SHA256.test(input.dependencyLockDigest)) blockers.push('dependency-lock-digest')

  const evidenceIndex = Array.isArray(input.evidenceIndex) ? input.evidenceIndex : []
  const evidenceKeys = evidenceIndex.map((entry) => entry?.key)
  const uniqueKeys = new Set(evidenceKeys)
  const sortedKeys = [...evidenceKeys].sort()
  const indexInvalid = evidenceIndex.length !== EXPECTED_EVIDENCE_KEYS.length
    || uniqueKeys.size !== evidenceIndex.length
    || sortedKeys.some((key, index) => key !== EXPECTED_EVIDENCE_KEYS[index])
    || evidenceIndex.some((entry) => !exactKeys(entry, ['digest', 'key']) || !SAFE_TEXT.test(entry.key) || !SHA256.test(entry.digest))
  if (indexInvalid) blockers.push('evidence-index')

  const expectedDigests = new Map<string, string>([
    ['assets', fnv1a(input.assetDigests).padEnd(64, '0')],
    ['build-log', input.buildLogDigest],
    ['dependency-lock', input.dependencyLockDigest],
    ['dependency-review', fnv1a({ schemaVersion: input.dependencyReviewSchemaVersion, reviewId: input.dependencyReviewId }).padEnd(64, '0')],
    ['unsigned-aab', input.unsignedAabSha256],
  ])
  if (!indexInvalid && evidenceIndex.some((entry) => expectedDigests.get(entry.key) !== entry.digest)) blockers.push('evidence-integrity')

  if (input.signingEnabled !== false || input.artifactUploaded !== false || input.playConsolePublished !== false || input.productionExecutionEnabled !== false) blockers.push('unsafe-state')
  if (Object.values(input as unknown as Record<string, unknown>).some((value) => typeof value === 'string' && !SAFE_TEXT.test(value) && !SHA256.test(value) && !SHA40.test(value))) blockers.push('credential-shaped-value')

  const immutableIndex = Object.freeze(evidenceIndex.map((entry) => Object.freeze({ key: entry.key, digest: entry.digest })).sort((a, b) => a.key.localeCompare(b.key)))
  const normalized = Object.freeze({ ...input, assetDigests: Object.freeze({ ...input.assetDigests }), toolchain: Object.freeze({ ...toolchain }), evidenceIndex: immutableIndex })
  const inputDigest = fnv1a(normalized)

  return Object.freeze({
    schemaVersion: PROVIDER_HUB_UNSIGNED_BUILD_EVIDENCE_BUNDLE_SCHEMA_VERSION,
    evidenceId: `provider-hub:unsigned-build-evidence:${inputDigest}`,
    state: blockers.length === 0 ? 'evidence_ready' : 'blocked',
    blockers: Object.freeze([...new Set(blockers)].sort()),
    sourceCommitSha: input.sourceCommitSha,
    packageName: 'com.signalboost.providerhub',
    unsignedAabPath: input.unsignedAabPath,
    unsignedAabSha256: input.unsignedAabSha256,
    evidenceIndex: immutableIndex,
    inputDigest,
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
