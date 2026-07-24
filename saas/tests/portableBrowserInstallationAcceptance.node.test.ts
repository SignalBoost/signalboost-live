import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPortableBrowserDeploymentPackageManifest } from '../lib/portable-browser/browser-deployment-package-manifest.ts'
import { buildPortableBrowserInstallationAcceptanceReport } from '../lib/portable-browser/browser-installation-acceptance.ts'

const manifest = buildPortableBrowserDeploymentPackageManifest({
  productId: 'portable-browser',
  productVersion: '1.0.0',
  generatedAt: 100,
  files: [{ path: 'dist/index.js', sha256: 'a'.repeat(64), bytes: 100, required: true, role: 'runtime' }],
})

function verification(valid = true) {
  return {
    valid,
    missingRequiredPaths: valid ? [] : ['dist/index.js'],
    hashMismatchPaths: [] as string[],
    sizeMismatchPaths: [] as string[],
    unexpectedPaths: [] as string[],
  }
}

function preflight(ready = true) {
  return {
    schemaVersion: '1.0.0' as const,
    ready,
    providerId: 'playwright-local',
    checks: [],
    errors: ready ? [] : ['approval_required'],
  }
}

test('accepts an intact package with a successful startup preflight', () => {
  const report = buildPortableBrowserInstallationAcceptanceReport({
    installationId: 'buyer-installation-001',
    evaluatedAt: 200,
    manifest,
    packageVerification: verification(),
    startupPreflight: preflight(),
  })

  assert.equal(report.accepted, true)
  assert.deepEqual(report.checks.map(check => check.id), ['package_integrity', 'startup_preflight'])
  assert.deepEqual(report.failureCodes, [])
  assert.equal(report.productId, 'portable-browser')
  assert.equal(report.productVersion, '1.0.0')
  assert.equal(report.providerId, 'playwright-local')
  assert.ok(Object.isFrozen(report))
  assert.ok(Object.isFrozen(report.checks))
})

test('fails closed and preserves deterministic package and preflight failure codes', () => {
  const report = buildPortableBrowserInstallationAcceptanceReport({
    installationId: 'buyer-installation-002',
    evaluatedAt: 201,
    manifest,
    packageVerification: verification(false),
    startupPreflight: preflight(false),
  })

  assert.equal(report.accepted, false)
  assert.deepEqual(report.failureCodes, [
    'package_missing_required:dist/index.js',
    'preflight:approval_required',
  ])
  assert.deepEqual(report.checks, [
    { id: 'package_integrity', passed: false, required: true },
    { id: 'startup_preflight', passed: false, required: true },
  ])
})

test('rejects malformed installation identifiers, timestamps, and missing inputs', () => {
  assert.throws(() => buildPortableBrowserInstallationAcceptanceReport({
    installationId: '../unsafe',
    evaluatedAt: 200,
    manifest,
    packageVerification: verification(),
    startupPreflight: preflight(),
  }), /installation_id_invalid/)

  assert.throws(() => buildPortableBrowserInstallationAcceptanceReport({
    installationId: 'buyer-installation-003',
    evaluatedAt: -1,
    manifest,
    packageVerification: verification(),
    startupPreflight: preflight(),
  }), /evaluated_at_invalid/)

  assert.throws(() => buildPortableBrowserInstallationAcceptanceReport({
    installationId: 'buyer-installation-004',
    evaluatedAt: 200,
    manifest: null as never,
    packageVerification: verification(),
    startupPreflight: preflight(),
  }), /input_invalid/)
})
