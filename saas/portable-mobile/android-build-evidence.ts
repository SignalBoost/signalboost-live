export const ANDROID_BUILD_EVIDENCE_SCHEMA_VERSION = 'signalboost-android-build-evidence-v1' as const

export type AndroidBuildEvidenceBlocker =
  | 'identity'
  | 'schema-versions'
  | 'source-commit'
  | 'toolchain'
  | 'verification-results'
  | 'artifact-path'
  | 'artifact-digest'
  | 'timestamps'
  | 'unsafe-state'

export interface AndroidBuildEvidenceInput {
  portableId: string
  packageName: string
  scaffoldSchemaVersion: string
  buildPlanSchemaVersion: string
  sourceCommitSha: string
  jdkVersion: string
  androidSdkVersion: string
  gradleVersion: string
  lintPassed: boolean
  testsPassed: boolean
  unsignedAabPath: string
  unsignedAabSha256: string
  buildStartedAt: string
  buildCompletedAt: string
  artifactSigned: boolean
  artifactUploaded: boolean
  playConsolePublished: boolean
  productionExecutionEnabled: boolean
}

export interface AndroidBuildEvidenceReport {
  schemaVersion: typeof ANDROID_BUILD_EVIDENCE_SCHEMA_VERSION
  portableId: string
  packageName: string
  state: 'evidence_validated' | 'blocked'
  blockers: readonly AndroidBuildEvidenceBlocker[]
  readOnly: true
  artifactAccessed: false
  signingEnabled: false
  storeSubmissionEnabled: false
  productionExecutionEnabled: false
}

const SHA = /^[0-9a-f]{40}$/
const SHA256 = /^[0-9a-f]{64}$/
const PACKAGE_NAME = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/

function nonEmpty(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function validDate(value: string): number | null {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function validateAndroidBuildEvidence(input: AndroidBuildEvidenceInput): AndroidBuildEvidenceReport {
  if (!input || typeof input !== 'object') throw new Error('Android build evidence input is required')

  const blockers: AndroidBuildEvidenceBlocker[] = []
  if (!nonEmpty(input.portableId) || !PACKAGE_NAME.test(input.packageName)) blockers.push('identity')
  if (input.scaffoldSchemaVersion !== 'signalboost-android-scaffold-v1' || input.buildPlanSchemaVersion !== 'signalboost-android-build-plan-v1') blockers.push('schema-versions')
  if (!SHA.test(input.sourceCommitSha)) blockers.push('source-commit')
  if (![input.jdkVersion, input.androidSdkVersion, input.gradleVersion].every(nonEmpty)) blockers.push('toolchain')
  if (!input.lintPassed || !input.testsPassed) blockers.push('verification-results')
  if (!input.unsignedAabPath.endsWith('.aab') || input.unsignedAabPath.startsWith('/') || input.unsignedAabPath.includes('..')) blockers.push('artifact-path')
  if (!SHA256.test(input.unsignedAabSha256)) blockers.push('artifact-digest')

  const started = validDate(input.buildStartedAt)
  const completed = validDate(input.buildCompletedAt)
  if (started === null || completed === null || completed < started) blockers.push('timestamps')
  if (input.artifactSigned || input.artifactUploaded || input.playConsolePublished || input.productionExecutionEnabled) blockers.push('unsafe-state')

  return Object.freeze({
    schemaVersion: ANDROID_BUILD_EVIDENCE_SCHEMA_VERSION,
    portableId: String(input.portableId ?? '').trim(),
    packageName: String(input.packageName ?? '').trim(),
    state: blockers.length === 0 ? 'evidence_validated' : 'blocked',
    blockers: Object.freeze(blockers),
    readOnly: true,
    artifactAccessed: false,
    signingEnabled: false,
    storeSubmissionEnabled: false,
    productionExecutionEnabled: false,
  })
}
