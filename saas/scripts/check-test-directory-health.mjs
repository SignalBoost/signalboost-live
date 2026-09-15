// saas/scripts/check-test-directory-health.mjs
/**
 * Build guard. saas/tests/ once reached 1,055 files in a single directory, past GitHub's 1,000-file
 * listing cap, so the directory could no longer be browsed in the web UI. This keeps that from
 * happening again, and keeps generated test names from growing without bound.
 *
 * Run from saas/:  node scripts/check-test-directory-health.mjs
 */
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = 'tests'
/** Well under GitHub's 1,000 so there is room to grow before anyone has to act. */
const MAX_FILES_PER_DIR = 800
const MAX_NAME_LENGTH = 100

/**
 * Names that already exceeded the limit when this guard was written. The list may shrink, never
 * grow: each one is a test that should have been table-driven instead of a new file per case.
 */
const KNOWN_LONG_NAMES = new Set([
  'eaeHumanReviewAttestationCertificateRegistryAttestationRegistryCertificateRegistryAttestationRegistryCertificate.node.test.ts',
  'human-review-attestation-certificate-registry-attestation-registry-certificate-integrity-validator.test.ts',
  'human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-integrity-validator.test.ts',
  'human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-integrity-validator.test.ts',
  'human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry-attestation-integrity-validator.test.ts',
  'human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry-attestation-registry-integrity-validator.test.ts',
  'human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry-attestation-registry.test.ts',
  'human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry-attestation.test.ts',
  'human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry-integrity-validator.test.ts',
  'human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry-certificate-registry.test.ts',
  'human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry-integrity-validator.test.ts',
  'human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation-registry.test.ts',
  'human-review-attestation-certificate-registry-attestation-registry-certificate-registry-attestation.test.ts',
  'human-review-attestation-certificate-registry-attestation-registry-certificate-registry-integrity.test.ts',
  'human-review-nested-attestation-registry-certificate-registry-attestation-integrity-validator.test.ts',
  'human-review-nested-attestation-registry-certificate-registry-attestation-registry-integrity-validator.test.ts',
])

const problems = []

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true })
  const files = entries.filter(entry => entry.isFile())
  if (files.length > MAX_FILES_PER_DIR) {
    problems.push(`${dir} holds ${files.length} files (limit ${MAX_FILES_PER_DIR}). Split it into subdirectories.`)
  }
  for (const file of files) {
    if (file.name.length > MAX_NAME_LENGTH && !KNOWN_LONG_NAMES.has(file.name)) {
      problems.push(`${path.join(dir, file.name)} has a ${file.name.length}-character name (limit ${MAX_NAME_LENGTH}). Make the test table-driven instead of adding a file per case.`)
    }
  }
  for (const entry of entries.filter(entry => entry.isDirectory())) walk(path.join(dir, entry.name))
}

try {
  statSync(ROOT)
} catch {
  console.log('no tests/ directory; nothing to check')
  process.exit(0)
}

walk(ROOT)

if (problems.length) {
  console.error('Test directory health check failed:')
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}
console.log('Test directory health: OK')
