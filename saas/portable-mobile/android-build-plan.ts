import type { AndroidScaffoldPlan } from './android-scaffold.ts'

export const ANDROID_BUILD_PLAN_SCHEMA_VERSION = 'signalboost-android-build-plan-v1' as const

export interface AndroidBuildPlan {
  schemaVersion: typeof ANDROID_BUILD_PLAN_SCHEMA_VERSION
  portableId: string
  packageName: string
  state: 'build_plan_ready'
  prerequisites: readonly string[]
  plannedTasks: readonly string[]
  expectedArtifacts: readonly string[]
  evidenceRequirements: readonly string[]
  commandsExecuted: false
  filesystemMutated: false
  appBundleGenerated: false
  signingEnabled: false
  storeSubmissionEnabled: false
  productionExecutionEnabled: false
}

const REQUIRED_FILES = [
  'settings.gradle.kts',
  'build.gradle.kts',
  'app/build.gradle.kts',
  'app/src/main/AndroidManifest.xml',
  'README.md',
] as const

export function createAndroidBuildPlan(scaffold: AndroidScaffoldPlan): AndroidBuildPlan {
  if (!scaffold || scaffold.schemaVersion !== 'signalboost-android-scaffold-v1') {
    throw new Error('a valid Android scaffold v1 plan is required')
  }
  if (scaffold.state !== 'scaffold_ready' || scaffold.unsigned !== true) {
    throw new Error('build planning requires an unsigned scaffold_ready plan')
  }
  if (scaffold.appBundleGenerated || scaffold.signingEnabled || scaffold.storeSubmissionEnabled || scaffold.productionExecutionEnabled) {
    throw new Error('build planning rejects generated, signed, submitted, or production state')
  }
  for (const path of REQUIRED_FILES) {
    if (typeof scaffold.files[path] !== 'string' || scaffold.files[path].trim().length === 0) {
      throw new Error(`build planning requires scaffold file: ${path}`)
    }
  }

  return Object.freeze({
    schemaVersion: ANDROID_BUILD_PLAN_SCHEMA_VERSION,
    portableId: scaffold.portableId,
    packageName: scaffold.packageName,
    state: 'build_plan_ready',
    prerequisites: Object.freeze([
      'JDK 17 installed by the buyer',
      'Android SDK 35 installed by the buyer',
      'Gradle dependency resolution available in the buyer build environment',
      'Digital Asset Links release fingerprint supplied after signing outside this plan',
    ]),
    plannedTasks: Object.freeze([
      'materialize the reviewed scaffold files in an isolated workspace',
      'run Gradle configuration validation',
      'run Android lint and unit tests',
      'assemble an unsigned release bundle',
      'record hashes and build logs as evidence',
    ]),
    expectedArtifacts: Object.freeze([
      'app/build/outputs/bundle/release/app-release.aab',
      'build-evidence/gradle-configuration.txt',
      'build-evidence/android-lint.txt',
      'build-evidence/artifact-sha256.txt',
    ]),
    evidenceRequirements: Object.freeze([
      'toolchain versions',
      'source commit SHA',
      'scaffold schema version',
      'successful lint and test output',
      'unsigned bundle SHA-256 digest',
    ]),
    commandsExecuted: false,
    filesystemMutated: false,
    appBundleGenerated: false,
    signingEnabled: false,
    storeSubmissionEnabled: false,
    productionExecutionEnabled: false,
  })
}
