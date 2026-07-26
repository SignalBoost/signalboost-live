import type { AndroidBuildPlan } from './android-build-plan.ts'

export const ANDROID_BUILD_EVIDENCE_SCHEMA_VERSION = 'signalboost-android-build-evidence-v1' as const

export interface AndroidBuildEvidenceManifest {
  schemaVersion: typeof ANDROID_BUILD_EVIDENCE_SCHEMA_VERSION
  portableId: string
  packageName: string
  state: 'build_evidence_planned'
  prerequisites: readonly string[]
  plannedTasks: readonly string[]
  expectedArtifacts: readonly Readonly<{ path: string; required: true }> []
  evidenceRequirements: readonly string[]
  integrityDigest: string
  commandsExecuted: false
  filesystemMutated: false
  appBundleGenerated: false
  signingEnabled: false
  storeSubmissionEnabled: false
  productionExecutionEnabled: false
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function canonical(values: readonly string[], label: string): readonly string[] {
  if (!Array.isArray(values) || values.length === 0) throw new Error(`${label} are required`)
  const normalized = values.map(value => {
    if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} contain an invalid value`)
    return value.trim()
  })
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label} contain duplicates`)
  return Object.freeze([...normalized].sort((left, right) => left.localeCompare(right)))
}

export function createAndroidBuildEvidenceManifest(plan: AndroidBuildPlan): AndroidBuildEvidenceManifest {
  if (!plan || plan.schemaVersion !== 'signalboost-android-build-plan-v1' || plan.state !== 'build_plan_ready') {
    throw new Error('a valid Android build plan v1 is required')
  }
  if (plan.commandsExecuted || plan.filesystemMutated || plan.appBundleGenerated || plan.signingEnabled || plan.storeSubmissionEnabled || plan.productionExecutionEnabled) {
    throw new Error('build evidence rejects executed, mutated, generated, signed, submitted, or production state')
  }

  const prerequisites = canonical(plan.prerequisites, 'prerequisites')
  const plannedTasks = canonical(plan.plannedTasks, 'planned tasks')
  const artifactPaths = canonical(plan.expectedArtifacts, 'expected artifacts')
  const evidenceRequirements = canonical(plan.evidenceRequirements, 'evidence requirements')
  for (const path of artifactPaths) {
    if (path.startsWith('/') || path.includes('..') || path.includes('\\')) throw new Error('unsafe expected artifact path rejected')
  }
  const expectedArtifacts = Object.freeze(artifactPaths.map(path => Object.freeze({ path, required: true as const })))
  const canonicalPayload = JSON.stringify({
    portableId: plan.portableId,
    packageName: plan.packageName,
    prerequisites,
    plannedTasks,
    expectedArtifacts,
    evidenceRequirements,
  })

  return Object.freeze({
    schemaVersion: ANDROID_BUILD_EVIDENCE_SCHEMA_VERSION,
    portableId: plan.portableId,
    packageName: plan.packageName,
    state: 'build_evidence_planned',
    prerequisites,
    plannedTasks,
    expectedArtifacts,
    evidenceRequirements,
    integrityDigest: `fnv1a32:${fnv1a(canonicalPayload)}`,
    commandsExecuted: false,
    filesystemMutated: false,
    appBundleGenerated: false,
    signingEnabled: false,
    storeSubmissionEnabled: false,
    productionExecutionEnabled: false,
  })
}

export function verifyAndroidBuildEvidenceManifest(manifest: AndroidBuildEvidenceManifest): boolean {
  if (!manifest || manifest.schemaVersion !== ANDROID_BUILD_EVIDENCE_SCHEMA_VERSION || manifest.state !== 'build_evidence_planned') return false
  if (manifest.commandsExecuted || manifest.filesystemMutated || manifest.appBundleGenerated || manifest.signingEnabled || manifest.storeSubmissionEnabled || manifest.productionExecutionEnabled) return false
  const canonicalPayload = JSON.stringify({
    portableId: manifest.portableId,
    packageName: manifest.packageName,
    prerequisites: [...manifest.prerequisites],
    plannedTasks: [...manifest.plannedTasks],
    expectedArtifacts: manifest.expectedArtifacts.map(item => ({ path: item.path, required: item.required })),
    evidenceRequirements: [...manifest.evidenceRequirements],
  })
  return manifest.integrityDigest === `fnv1a32:${fnv1a(canonicalPayload)}`
}
