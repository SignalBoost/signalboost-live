import test from 'node:test'
import assert from 'node:assert/strict'
import { createPortableBuyerHandoffManifest, createPortableCommercialReadinessReport, createPortableProductReadinessDashboard, portableProductReadinessDashboard, portableProductRegistry, providerHubCommercialEvidenceProfile, validatePortableDeploymentAcceptanceEvidence, validatePortableOperationsRecoveryEvidence } from '../lib/portable-products/index.ts'
import { readFileSync } from 'node:fs'

test('portable readiness dashboard is frozen, deterministic, and registry-driven', () => {
  const first = createPortableProductReadinessDashboard(); const second = createPortableProductReadinessDashboard()
  assert.deepEqual(first, second); assert.notEqual(first, second); assert.ok(Object.isFrozen(first) && Object.isFrozen(first.products)); assert.doesNotThrow(() => JSON.stringify(first))
  assert.deepEqual(first.products.map(product => product.productId), portableProductRegistry.map(product => product.manifest.productId))
  for (const product of first.products) {
    assert.ok(Object.isFrozen(product) && Object.isFrozen(product.readiness))
    assert.deepEqual(product.readiness.map(check => check.dimension), ['registry', 'manifest', 'documentation', 'architecture', 'dependencies', 'localization', 'testing', 'security', 'packaging-specification', 'licensing-metadata'])
  }
  assert.equal(portableProductReadinessDashboard.products.find(product => product.productId === 'campaign-studio')?.readyForLicensing, true)
  assert.equal(portableProductReadinessDashboard.products.find(product => product.productId === 'portable-ai-chief-of-staff')?.readyForLicensing, false)
})

test('readiness surfaces remain internal, guarded, and read-only', () => {
  const route = readFileSync(new URL('../app/api/internal/portable-product-readiness/route.ts', import.meta.url), 'utf8')
  const page = readFileSync(new URL('../app/dashboard/portable-products/readiness/page.tsx', import.meta.url), 'utf8')
  assert.match(route, /requireAdmin/); assert.match(page, /getCurrentUser/); assert.match(page, /access\.isAdmin/)
  for (const source of [route, page]) for (const forbidden of [/export async function (POST|PUT|PATCH|DELETE)/, /checkout/i, /purchase/i, /activate/i, /download/i, /<form/i, /worker/i, /cos tool/i]) assert.doesNotMatch(source, forbidden)
})

test('Provider Hub commercial evidence is explicit, immutable, and honestly incomplete', () => {
  const first = createPortableCommercialReadinessReport()
  const second = createPortableCommercialReadinessReport()
  const providerHub = first.entries.find(entry => entry.productId === 'provider-hub')
  assert.deepEqual(first, second)
  assert.notEqual(first, second)
  assert.ok(Object.isFrozen(first) && Object.isFrozen(first.entries))
  assert.ok(providerHub)
  assert.equal(providerHub.readyCount, 6)
  assert.equal(providerHub.totalCount, 10)
  assert.equal(providerHub.completionPercent, 60)
  assert.equal(providerHub.commerciallyReady, false)
  assert.deepEqual(providerHub.checks.filter(check => check.status === 'ready').map(check => check.dimension), [
    'architecture',
    'distribution-package',
    'integrity-manifest',
    'buyer-installation',
    'buyer-configuration',
    'support-boundary',
  ])
  assert.deepEqual(providerHub.checks.filter(check => check.status === 'blocked').map(check => check.dimension), [
    'licensing-enforcement',
    'fulfillment-handoff',
    'operations-recovery',
    'deployment-acceptance',
  ])
  const recovery = providerHub.checks.find(check => check.dimension === 'operations-recovery')
  assert.deepEqual(recovery?.blockers, ['missing-operations-recovery-evidence'])
  for (const check of providerHub.checks) {
    assert.ok(Object.isFrozen(check) && Object.isFrozen(check.evidence) && Object.isFrozen(check.blockers))
  }
})

test('Integrations Hub commercial evidence is explicit, immutable, and honestly incomplete', () => {
  const report = createPortableCommercialReadinessReport()
  const integrationsHub = report.entries.find(entry => entry.productId === 'integrations-hub')
  assert.ok(integrationsHub)
  assert.equal(integrationsHub.readyCount, 4)
  assert.equal(integrationsHub.totalCount, 10)
  assert.equal(integrationsHub.completionPercent, 40)
  assert.equal(integrationsHub.commerciallyReady, false)
  assert.deepEqual(integrationsHub.checks.filter(check => check.status === 'ready').map(check => check.dimension), [
    'architecture',
    'buyer-installation',
    'buyer-configuration',
    'support-boundary',
  ])
  assert.deepEqual(integrationsHub.checks.filter(check => check.status === 'blocked').map(check => check.dimension), [
    'distribution-package',
    'integrity-manifest',
    'licensing-enforcement',
    'fulfillment-handoff',
    'operations-recovery',
    'deployment-acceptance',
  ])
  for (const check of integrationsHub.checks) assert.ok(Object.isFrozen(check) && Object.isFrozen(check.evidence) && Object.isFrozen(check.blockers))
})

test('Provider Hub product evidence profile stays fail-closed for external proof', () => {
  assert.equal(providerHubCommercialEvidenceProfile.productId, 'provider-hub')
  assert.equal(providerHubCommercialEvidenceProfile.verifiedCount, 6)
  assert.equal(providerHubCommercialEvidenceProfile.totalCount, 10)
  assert.equal(providerHubCommercialEvidenceProfile.completionPercent, 60)
  assert.equal(providerHubCommercialEvidenceProfile.commerciallyReady, false)
  assert.deepEqual(providerHubCommercialEvidenceProfile.dimensions.filter(dimension => dimension.status === 'verified').map(dimension => dimension.dimension), [
    'architecture',
    'distribution-package',
    'integrity-manifest',
    'buyer-installation',
    'buyer-configuration',
    'support-boundary',
  ])
  const blocked = providerHubCommercialEvidenceProfile.dimensions.filter(dimension => dimension.status === 'external-evidence-required')
  assert.ok(blocked.find(dimension => dimension.dimension === 'licensing-enforcement')?.blockers.includes('missing-buyer-entitlement-enforcement-evidence'))
  assert.ok(blocked.find(dimension => dimension.dimension === 'fulfillment-handoff')?.blockers.includes('missing-complete-versioned-buyer-handoff-bundle'))
  assert.ok(blocked.find(dimension => dimension.dimension === 'operations-recovery')?.blockers.includes('missing-buyer-backup-infrastructure-and-recovery-rehearsal'))
  assert.ok(blocked.find(dimension => dimension.dimension === 'deployment-acceptance')?.blockers.includes('missing-clean-environment-install-and-buyer-signoff'))
  assert.ok(Object.isFrozen(providerHubCommercialEvidenceProfile))
  assert.ok(Object.isFrozen(providerHubCommercialEvidenceProfile.dimensions))
  assert.ok(providerHubCommercialEvidenceProfile.dimensions.every(dimension => Object.isFrozen(dimension)))
})

test('buyer handoff manifest is immutable and fails closed when delivery evidence is incomplete', () => {
  const manifest = createPortableBuyerHandoffManifest({ productId: 'provider-hub', releaseVersion: '1.0.0', packageFormat: 'tar.gz', artifacts: [], buyerResponsibilities: [], supplierResponsibilities: [], exclusions: ['checkout', 'entitlement-activation', 'provider-execution'] })
  assert.equal(manifest.complete, false)
  assert.ok(manifest.blockers.includes('missing-required-artifact:package'))
  assert.ok(manifest.blockers.includes('missing-required-artifact:acceptance'))
  assert.ok(manifest.blockers.includes('missing-buyer-responsibilities'))
  assert.ok(Object.isFrozen(manifest) && Object.isFrozen(manifest.artifacts) && Object.isFrozen(manifest.blockers))
})

test('buyer handoff manifest rejects optional required classes and blank responsibility boundaries', () => {
  const digest = 'a'.repeat(64)
  const artifacts = ['package', 'integrity', 'installation', 'configuration', 'operations', 'acceptance', 'support'].map(kind => ({ kind: kind as 'package' | 'integrity' | 'installation' | 'configuration' | 'operations' | 'acceptance' | 'support', path: `docs/handoff/${kind}.json`, sha256: digest, required: false }))
  const manifest = createPortableBuyerHandoffManifest({ productId: 'provider-hub', releaseVersion: '1.0.0', packageFormat: 'tar.gz', artifacts, buyerResponsibilities: ['   '], supplierResponsibilities: [''], exclusions: [] })
  assert.equal(manifest.complete, false)
  assert.ok(manifest.blockers.includes('missing-required-artifact:package'))
  assert.ok(manifest.blockers.includes('missing-required-artifact:support'))
  assert.ok(manifest.blockers.includes('missing-buyer-responsibilities'))
  assert.ok(manifest.blockers.includes('missing-supplier-responsibilities'))
})

test('buyer handoff manifest becomes complete only with all bounded evidence classes', () => {
  const digest = 'a'.repeat(64)
  const artifacts = ['package', 'integrity', 'installation', 'configuration', 'operations', 'acceptance', 'support'].map(kind => ({ kind: kind as 'package' | 'integrity' | 'installation' | 'configuration' | 'operations' | 'acceptance' | 'support', path: `docs/handoff/${kind}.json`, sha256: digest, required: true }))
  const manifest = createPortableBuyerHandoffManifest({
    productId: 'provider-hub',
    releaseVersion: '1.0.0',
    packageFormat: 'tar.gz',
    artifacts,
    buyerResponsibilities: ['Supply provider credentials through the buyer-owned secret boundary.'],
    supplierResponsibilities: ['Deliver the verified package and documented support boundary.'],
    exclusions: ['checkout', 'entitlement-activation', 'provider-execution'],
    preparedAt: '2026-07-26T20:00:00.000Z',
    acknowledgedAt: '2026-07-26T20:05:00.000Z',
    artifactTransferred: false,
    credentialsTransferred: false,
    entitlementMutated: false,
    deploymentPerformed: false,
    productionExecutionEnabled: false,
  })
  assert.equal(manifest.complete, true)
  assert.deepEqual(manifest.blockers, [])
  assert.equal(manifest.schemaVersion, 'portable-buyer-handoff-manifest.v2')
  assert.equal(manifest.readOnly, true)
})

const operationsRecoveryBase = Object.freeze({
  productId: 'provider-hub', releaseVersion: '1.2.0', previousVersion: '1.1.0',
  runbookReference: 'urn:portable:runbook:provider-hub', upgradeReference: 'https://docs.example.test/provider-hub/upgrade', rollbackReference: 'https://docs.example.test/provider-hub/rollback', backupReference: 'https://docs.example.test/provider-hub/backup', restoreReference: 'https://docs.example.test/provider-hub/restore',
  recoveryPointObjectiveMinutes: 60, recoveryTimeObjectiveMinutes: 120,
  validatedAt: '2026-07-26T21:30:00.000Z', expiresAt: '2027-07-26T21:30:00.000Z',
  readOnly: true, artifactAccessed: false, upgradeExecuted: false, rollbackExecuted: false, backupExecuted: false, restoreExecuted: false, deploymentPerformed: false, productionExecutionEnabled: false,
})

test('validates immutable operations and recovery evidence', () => {
  const result = validatePortableOperationsRecoveryEvidence(operationsRecoveryBase)
  assert.equal(result.state, 'operations_recovery_evidence_validated')
  assert.deepEqual(result.blockers, [])
  assert.equal(result.references.rollback, operationsRecoveryBase.rollbackReference)
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.blockers) && Object.isFrozen(result.references))
})

test('operations and recovery evidence fails closed for invalid bounded inputs', () => {
  const result = validatePortableOperationsRecoveryEvidence({ ...operationsRecoveryBase, productId: 'unknown-product', releaseVersion: 'latest', previousVersion: 'latest', recoveryPointObjectiveMinutes: 0, expiresAt: '2025-07-26T21:30:00.000Z' })
  assert.equal(result.state, 'blocked')
  for (const blocker of ['identity', 'version', 'objectives', 'timestamps'] as const) assert.ok(result.blockers.includes(blocker))
})

test('operations and recovery evidence rejects unsafe references and execution state', () => {
  const result = validatePortableOperationsRecoveryEvidence({ ...operationsRecoveryBase, restoreReference: 'https://docs.example.test/restore?token=secret', restoreExecuted: true, deploymentPerformed: true })
  assert.equal(result.state, 'blocked')
  assert.ok(result.blockers.includes('references'))
  assert.ok(result.blockers.includes('unsafe-state'))
  assert.equal(result.references.restore, '')
})

const deploymentAcceptanceChecks = ['clean-install', 'configuration-validation', 'health-check', 'rollback-readiness', 'buyer-signoff'].map(kind => ({ kind, status: 'passed', evidenceReference: `urn:portable:acceptance:${kind}` }))
const deploymentAcceptanceBase = Object.freeze({
  productId: 'provider-hub', tenantId: 'tenant-1', environmentId: 'production-us', releaseVersion: '1.0.0', checks: deploymentAcceptanceChecks,
  evaluatedAt: '2026-07-26T21:30:00.000Z', acknowledgedAt: '2026-07-26T21:31:00.000Z', buyerAccepted: true, buyerSignoffReference: 'urn:portable:acceptance:buyer-signoff',
  readOnly: true, deploymentPerformed: false, infrastructureMutationPerformed: false, credentialTransferred: false, providerExecutionPerformed: false, productionExecutionEnabled: false,
})

test('validates immutable deployment acceptance evidence', () => {
  const result = validatePortableDeploymentAcceptanceEvidence(deploymentAcceptanceBase)
  assert.equal(result.state, 'deployment_acceptance_evidence_validated')
  assert.deepEqual(result.blockers, [])
  assert.equal(result.checks.length, 5)
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.checks))
})

test('deployment acceptance evidence fails closed for malformed checks and references', () => {
  const result = validatePortableDeploymentAcceptanceEvidence({
    ...deploymentAcceptanceBase,
    checks: [...deploymentAcceptanceChecks.slice(0, 4), { ...deploymentAcceptanceChecks[0], evidenceReference: 'https://example.test/?token=secret' }],
    acknowledgedAt: '2026-07-26T21:29:00.000Z',
  })
  assert.equal(result.state, 'blocked')
  assert.ok(result.blockers.includes('checks'))
  assert.ok(result.blockers.includes('references'))
  assert.ok(result.blockers.includes('timestamps'))
})

test('deployment acceptance evidence rejects missing signoff and unsafe execution state', () => {
  const result = validatePortableDeploymentAcceptanceEvidence({ ...deploymentAcceptanceBase, productId: 'unknown-product', tenantId: '', environmentId: 'bad environment', buyerAccepted: false, buyerSignoffReference: '', deploymentPerformed: true })
  for (const blocker of ['identity', 'scope', 'acknowledgment', 'unsafe-state'] as const) assert.ok(result.blockers.includes(blocker))
  assert.equal(result.deploymentPerformed, false)
})
