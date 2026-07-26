export const PROVIDER_HUB_DEPENDENCY_REVIEW_SCHEMA_VERSION = 'signalboost-provider-hub-dependency-review-v1' as const

export interface AndroidDependencyReviewInput {
  portableId: string
  packageName: string
  scaffoldSchemaVersion: string
  buildPlanSchemaVersion: string
  provenanceSchemaVersion: string
  jdkVersion: string
  androidSdkVersion: string
  gradleVersion: string
  androidGradlePluginVersion: string
  browserHelperCoordinate: string
  repositories: readonly string[]
  dependencyResolutionPerformed: boolean
  signingEnabled: boolean
  uploadEnabled: boolean
  publicationEnabled: boolean
  productionExecutionEnabled: boolean
}

export interface AndroidDependencyReviewReport {
  schemaVersion: typeof PROVIDER_HUB_DEPENDENCY_REVIEW_SCHEMA_VERSION
  portableId: 'provider-hub'
  packageName: 'com.signalboost.providerhub'
  state: 'review_ready' | 'blocked'
  blockers: readonly string[]
  reviewId: string
  dependencies: Readonly<{
    jdkVersion: string
    androidSdkVersion: string
    gradleVersion: string
    androidGradlePluginVersion: string
    browserHelperCoordinate: string
    repositories: readonly string[]
  }>
  dependencyResolutionPerformed: false
  networkAccessed: false
  filesystemMutated: false
  signingEnabled: false
  uploadEnabled: false
  publicationEnabled: false
  productionExecutionEnabled: false
}

const EXACT_VERSION = /^\d+\.\d+(?:\.\d+)?(?:-[a-z0-9.-]+)?$/i
const COORDINATE = /^[a-z0-9_.-]+:[a-z0-9_.-]+:\d+\.\d+(?:\.\d+)?$/i
const APPROVED_REPOSITORIES = ['google', 'mavenCentral'] as const
const UNSAFE = /snapshot|latest|\+|credential|password|token|signing|publish|upload/i

function fnv1a(value: string): string {
  let hash = 0x811c9dc5
  for (const char of value) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function reviewProviderHubDependencies(input: AndroidDependencyReviewInput): AndroidDependencyReviewReport {
  const blockers: string[] = []
  if (input.portableId !== 'provider-hub' || input.packageName !== 'com.signalboost.providerhub') blockers.push('identity')
  if (input.scaffoldSchemaVersion !== 'signalboost-android-scaffold-v1') blockers.push('scaffold-schema')
  if (input.buildPlanSchemaVersion !== 'signalboost-android-build-plan-v1') blockers.push('build-plan-schema')
  if (input.provenanceSchemaVersion !== 'signalboost-provider-hub-unsigned-build-provenance-v1') blockers.push('provenance-schema')
  for (const [name, value] of [['jdk-version', input.jdkVersion], ['android-sdk-version', input.androidSdkVersion], ['gradle-version', input.gradleVersion], ['android-gradle-plugin-version', input.androidGradlePluginVersion]] as const) {
    if (!EXACT_VERSION.test(value) || UNSAFE.test(value)) blockers.push(name)
  }
  if (!COORDINATE.test(input.browserHelperCoordinate) || UNSAFE.test(input.browserHelperCoordinate)) blockers.push('browser-helper')
  if (input.repositories.length === 0 || input.repositories.some((repository) => !APPROVED_REPOSITORIES.includes(repository as typeof APPROVED_REPOSITORIES[number]) || UNSAFE.test(repository))) blockers.push('repositories')
  if (input.dependencyResolutionPerformed || input.signingEnabled || input.uploadEnabled || input.publicationEnabled || input.productionExecutionEnabled) blockers.push('unsafe-state')
  const sorted = [...new Set(blockers)].sort()
  const repositories = Object.freeze([...input.repositories].sort())
  const canonical = [input.portableId, input.packageName, input.scaffoldSchemaVersion, input.buildPlanSchemaVersion, input.provenanceSchemaVersion, input.jdkVersion, input.androidSdkVersion, input.gradleVersion, input.androidGradlePluginVersion, input.browserHelperCoordinate, ...repositories].join('|')
  return Object.freeze({
    schemaVersion: PROVIDER_HUB_DEPENDENCY_REVIEW_SCHEMA_VERSION,
    portableId: 'provider-hub',
    packageName: 'com.signalboost.providerhub',
    state: sorted.length === 0 ? 'review_ready' : 'blocked',
    blockers: Object.freeze(sorted),
    reviewId: `dependency-review-${fnv1a(canonical)}`,
    dependencies: Object.freeze({
      jdkVersion: input.jdkVersion,
      androidSdkVersion: input.androidSdkVersion,
      gradleVersion: input.gradleVersion,
      androidGradlePluginVersion: input.androidGradlePluginVersion,
      browserHelperCoordinate: input.browserHelperCoordinate,
      repositories,
    }),
    dependencyResolutionPerformed: false,
    networkAccessed: false,
    filesystemMutated: false,
    signingEnabled: false,
    uploadEnabled: false,
    publicationEnabled: false,
    productionExecutionEnabled: false,
  })
}
