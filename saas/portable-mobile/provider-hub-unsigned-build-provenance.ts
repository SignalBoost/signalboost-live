// saas/portable-mobile/provider-hub-unsigned-build-provenance.ts

export const PROVIDER_HUB_UNSIGNED_BUILD_PROVENANCE_SCHEMA_VERSION = 'signalboost-provider-hub-unsigned-build-provenance-v1' as const

export interface ProviderHubUnsignedBuildProvenanceInput {
  sourceCommitSha: string
  packageName: string
  scaffoldSchemaVersion: string
  buildPlanSchemaVersion: string
  assetDigests: Readonly<Record<'manifest' | 'serviceWorker' | 'offlinePage' | 'icon' | 'maskableIcon' | 'assetLinksTemplate', string>>
  toolchain: Readonly<{ jdk: string; androidSdk: string; gradle: string; androidGradlePlugin: string }>
  lintPassed: boolean
  testsPassed: boolean
  unsignedAabPath: string
  unsignedAabSha256: string
  artifactSigned: boolean
  artifactUploaded: boolean
  playConsolePublished: boolean
  productionExecutionEnabled: boolean
}

export interface ProviderHubUnsignedBuildProvenanceManifest {
  schemaVersion: typeof PROVIDER_HUB_UNSIGNED_BUILD_PROVENANCE_SCHEMA_VERSION
  provenanceId: string
  state: 'validated' | 'blocked'
  blockers: readonly string[]
  sourceCommitSha: string
  packageName: 'com.signalboost.providerhub'
  unsignedAabPath: string
  unsignedAabSha256: string
  inputDigest: string
  artifactAccessed: false
  buildExecuted: false
  signingEnabled: false
  uploadEnabled: false
  publicationEnabled: false
  productionExecutionEnabled: false
}

const SHA40 = /^[0-9a-f]{40}$/
const SHA256 = /^[0-9a-f]{64}$/
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[a-zA-Z0-9._/-]+\.aab$/
const VERSION = /^[0-9]+(?:\.[0-9]+){0,3}$/
const EXPECTED_ASSET_KEYS = ['assetLinksTemplate', 'icon', 'manifest', 'maskableIcon', 'offlinePage', 'serviceWorker'] as const

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function digest(value: unknown): string {
  const input = canonical(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function createProviderHubUnsignedBuildProvenance(input: ProviderHubUnsignedBuildProvenanceInput): ProviderHubUnsignedBuildProvenanceManifest {
  if (!input || typeof input !== 'object') throw new Error('unsigned build provenance input is required')
  const assetDigests = input.assetDigests && typeof input.assetDigests === 'object' ? input.assetDigests : {} as ProviderHubUnsignedBuildProvenanceInput['assetDigests']
  const toolchain = input.toolchain && typeof input.toolchain === 'object' ? input.toolchain : {} as ProviderHubUnsignedBuildProvenanceInput['toolchain']
  const assetKeys = Object.keys(assetDigests).sort()
  const blockers = [
    !SHA40.test(input.sourceCommitSha) && 'source-commit',
    input.packageName !== 'com.signalboost.providerhub' && 'package-identity',
    input.scaffoldSchemaVersion !== 'signalboost-android-scaffold-v1' && 'scaffold-schema',
    input.buildPlanSchemaVersion !== 'signalboost-android-build-plan-v1' && 'build-plan-schema',
    (assetKeys.length !== EXPECTED_ASSET_KEYS.length || assetKeys.some((key, index) => key !== EXPECTED_ASSET_KEYS[index]) || Object.values(assetDigests).some(value => !SHA256.test(value))) && 'asset-digests',
    (!VERSION.test(toolchain.jdk) || !VERSION.test(toolchain.androidSdk) || !VERSION.test(toolchain.gradle) || !VERSION.test(toolchain.androidGradlePlugin)) && 'toolchain',
    input.lintPassed !== true && 'lint',
    input.testsPassed !== true && 'tests',
    !SAFE_PATH.test(input.unsignedAabPath) && 'artifact-path',
    !SHA256.test(input.unsignedAabSha256) && 'artifact-digest',
    (input.artifactSigned !== false || input.artifactUploaded !== false || input.playConsolePublished !== false || input.productionExecutionEnabled !== false) && 'unsafe-state',
  ].filter((value): value is string => Boolean(value)).sort()

  const normalized = Object.freeze({ ...input, assetDigests: Object.freeze({ ...assetDigests }), toolchain: Object.freeze({ ...toolchain }) })
  const inputDigest = digest(normalized)
  return Object.freeze({
    schemaVersion: PROVIDER_HUB_UNSIGNED_BUILD_PROVENANCE_SCHEMA_VERSION,
    provenanceId: `provider-hub:unsigned-build:${inputDigest}`,
    state: blockers.length === 0 ? 'validated' : 'blocked',
    blockers: Object.freeze(blockers),
    sourceCommitSha: input.sourceCommitSha,
    packageName: 'com.signalboost.providerhub',
    unsignedAabPath: input.unsignedAabPath,
    unsignedAabSha256: input.unsignedAabSha256,
    inputDigest,
    artifactAccessed: false,
    buildExecuted: false,
    signingEnabled: false,
    uploadEnabled: false,
    publicationEnabled: false,
    productionExecutionEnabled: false,
  })
}
