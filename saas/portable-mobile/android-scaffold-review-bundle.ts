import type { AndroidScaffoldPlan } from './android-scaffold.ts'

export const ANDROID_SCAFFOLD_REVIEW_BUNDLE_SCHEMA_VERSION = 'signalboost-android-scaffold-review-bundle-v1' as const

export interface AndroidScaffoldReviewFile {
  path: string
  bytes: number
  digest: string
  content: string
}

export interface AndroidScaffoldReviewBundle {
  schemaVersion: typeof ANDROID_SCAFFOLD_REVIEW_BUNDLE_SCHEMA_VERSION
  portableId: string
  packageName: string
  state: 'review_bundle_ready'
  files: readonly AndroidScaffoldReviewFile[]
  fileCount: number
  totalBytes: number
  bundleDigest: string
  unsigned: true
  archiveGenerated: false
  filesystemWritesEnabled: false
  appBundleGenerated: false
  signingEnabled: false
  storeSubmissionEnabled: false
  productionExecutionEnabled: false
}

const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/
const FORBIDDEN_CONTENT = /BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY|storePassword\s*=|keyPassword\s*=|signingConfigs\s*\{/i

function fnv1a(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function validatePlan(plan: AndroidScaffoldPlan): void {
  if (!plan || typeof plan !== 'object') throw new Error('Android scaffold plan is required')
  if (plan.state !== 'scaffold_ready' || plan.unsigned !== true) throw new Error('review bundle requires an unsigned scaffold-ready plan')
  if (plan.appBundleGenerated || plan.signingEnabled || plan.storeSubmissionEnabled || plan.productionExecutionEnabled) {
    throw new Error('review bundle rejects executable or production scaffold claims')
  }
}

export function createAndroidScaffoldReviewBundle(plan: AndroidScaffoldPlan): AndroidScaffoldReviewBundle {
  validatePlan(plan)

  const entries = Object.entries(plan.files).sort(([left], [right]) => left.localeCompare(right))
  if (entries.length === 0) throw new Error('review bundle requires at least one scaffold file')

  const files = entries.map(([path, content]) => {
    if (!SAFE_PATH.test(path)) throw new Error(`unsafe scaffold path rejected: ${path}`)
    if (typeof content !== 'string' || content.length === 0) throw new Error(`empty scaffold content rejected: ${path}`)
    if (FORBIDDEN_CONTENT.test(content)) throw new Error(`signing material rejected: ${path}`)
    return Object.freeze({
      path,
      bytes: Buffer.byteLength(content, 'utf8'),
      digest: `fnv1a32:${fnv1a(content)}`,
      content,
    })
  })

  const canonical = files.map(file => `${file.path}\n${file.bytes}\n${file.digest}\n${file.content}`).join('\n--file--\n')
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0)

  return Object.freeze({
    schemaVersion: ANDROID_SCAFFOLD_REVIEW_BUNDLE_SCHEMA_VERSION,
    portableId: plan.portableId,
    packageName: plan.packageName,
    state: 'review_bundle_ready',
    files: Object.freeze(files),
    fileCount: files.length,
    totalBytes,
    bundleDigest: `fnv1a32:${fnv1a(canonical)}`,
    unsigned: true,
    archiveGenerated: false,
    filesystemWritesEnabled: false,
    appBundleGenerated: false,
    signingEnabled: false,
    storeSubmissionEnabled: false,
    productionExecutionEnabled: false,
  })
}

export function verifyAndroidScaffoldReviewBundle(bundle: AndroidScaffoldReviewBundle): boolean {
  if (!bundle || bundle.schemaVersion !== ANDROID_SCAFFOLD_REVIEW_BUNDLE_SCHEMA_VERSION) return false
  if (bundle.state !== 'review_bundle_ready' || bundle.unsigned !== true) return false
  if (bundle.archiveGenerated || bundle.filesystemWritesEnabled || bundle.appBundleGenerated || bundle.signingEnabled || bundle.storeSubmissionEnabled || bundle.productionExecutionEnabled) return false
  if (!Array.isArray(bundle.files) || bundle.files.length === 0 || bundle.fileCount !== bundle.files.length) return false

  const paths = bundle.files.map(file => file.path)
  if (paths.some((path, index) => !SAFE_PATH.test(path) || (index > 0 && paths[index - 1].localeCompare(path) >= 0))) return false

  let totalBytes = 0
  for (const file of bundle.files) {
    if (FORBIDDEN_CONTENT.test(file.content)) return false
    const bytes = Buffer.byteLength(file.content, 'utf8')
    if (file.bytes !== bytes || file.digest !== `fnv1a32:${fnv1a(file.content)}`) return false
    totalBytes += bytes
  }
  if (bundle.totalBytes !== totalBytes) return false

  const canonical = bundle.files.map(file => `${file.path}\n${file.bytes}\n${file.digest}\n${file.content}`).join('\n--file--\n')
  return bundle.bundleDigest === `fnv1a32:${fnv1a(canonical)}`
}
