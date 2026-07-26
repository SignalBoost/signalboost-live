import type { AndroidBuildPlan } from './android-build-plan.ts'

export const ANDROID_BUILD_EVIDENCE_MANIFEST_SCHEMA_VERSION = 'signalboost-android-build-evidence-manifest-v1' as const

export interface AndroidBuildEvidenceManifest {
  schemaVersion: typeof ANDROID_BUILD_EVIDENCE_MANIFEST_SCHEMA_VERSION
  portableId: string
  packageName: string
  state: 'build_evidence_planned'
  prerequisites: readonly string[]
  plannedTasks: readonly string[]
  expectedArtifacts: readonly Readonly<{ path: string; required: true }>[]
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

function canonicalPayload(manifest: Pick<AndroidBuildEvidenceManifest, 'portableId' | 'packageName' | 'prerequisites' | 'plannedTasks' | 'expectedArtifacts' | 'evidenceRequirements'>): string {
  return JSON.stringify({
    portableId: manifest.portableId,
    packageName: manifest.packageName,
    prerequisites: [...manifest.prerequisites],
    plannedTasks: [...manifest.plannedTasks],
    expectedArtifacts: manifest.expectedArtifacts.map(item => ({ path: item.path, required: item.required })),
    evidenceRequirements: [...manifest.evidenceRequirements],
  })
}

export function createAndroidBuildEvidenceManifest(plan: AndroidBuildPlan): AndroidBuildEvidenceManifest {
  if (!plan || plan.schemaVersion !== 'signalboost-android-build-plan-v1' || plan.state !== 'build_plan_ready') {
    throw new Error('a valid Android build plan v1 is required')
  }
  if (plan.commandsExecuted !== false || plan.filesystemMutated !== false || plan.appBundleGenerated !== false || plan.signingEnabled !== false || plan.storeSubmissionEnabled !== false || plan.productionExecutionEnabled !== false) {
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
  const base = {
    portableId: plan.portableId,
    packageName: plan.packageName,
    prerequisites,
    plannedTasks,
    expectedArtifacts,
    evidenceRequirements,
  }

  return Object.freeze({
    schemaVersion: ANDROID_BUILD_EVIDENCE_MANIFEST_SCHEMA_VERSION,
    ...base,
    state: 'build_evidence_planned',
    integrityDigest: `fnv1a32:${fnv1a(canonicalPayload(base))}`,
    commandsExecuted: false,
    filesystemMutated: false,
    appBundleGenerated: false,
    signingEnabled: false,
    storeSubmissionEnabled: false,
    productionExecutionEnabled: false,
  })
}

export function verifyAndroidBuildEvidenceManifest(value: unknown): value is AndroidBuildEvidenceManifest {
  if (!value || typeof value !== 'object') return false
  const manifest = value as Partial<AndroidBuildEvidenceManifest>
  if (manifest.schemaVersion !== ANDROID_BUILD_EVIDENCE_MANIFEST_SCHEMA_VERSION || manifest.state !== 'build_evidence_planned') return false
  if (manifest.commandsExecuted !== false || manifest.filesystemMutated !== false || manifest.appBundleGenerated !== false || manifest.signingEnabled !== false || manifest.storeSubmissionEnabled !== false || manifest.productionExecutionEnabled !== false) return false
  if (typeof manifest.portableId !== 'string' || manifest.portableId.trim().length === 0 || typeof manifest.packageName !== 'string' || manifest.packageName.trim().length === 0) return false
  if (!Array.isArray(manifest.prerequisites) || !manifest.prerequisites.every(item => typeof item === 'string' && item.length > 0)) return false
  if (!Array.isArray(manifest.plannedTasks) || !manifest.plannedTasks.every(item => typeof item === 'string' && item.length > 0)) return false
  if (!Array.isArray(manifest.evidenceRequirements) || !manifest.evidenceRequirements.every(item => typeof item === 'string' && item.length > 0)) return false
  if (!Array.isArray(manifest.expectedArtifacts) || !manifest.expectedArtifacts.every(item => item && typeof item === 'object' && typeof item.path === 'string' && item.path.length > 0 && item.required === true)) return false
  if (typeof manifest.integrityDigest !== 'string') return false

  try {
    return manifest.integrityDigest === `fnv1a32:${fnv1a(canonicalPayload(manifest as AndroidBuildEvidenceManifest))}`
  } catch {
    return false
  }
}
