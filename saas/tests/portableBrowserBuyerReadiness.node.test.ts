// saas/tests/portableBrowserBuyerReadiness.node.test.ts
//
// The catalog describes 27 browser vendors in detail — category, deployment models, auth
// modes, evidence and compliance metadata — and until now every single one of them declared
// `configurationFieldDefinitions: []`. A buyer could read the entire catalog and still not
// know whether their stack needed a hub URL, a region, or a credential.
//
// These tests hold two lines: a declared contract is checkable, and an UNDECLARED contract
// is reported as a gap rather than passing as "nothing required".

import test from 'node:test'
import assert from 'node:assert/strict'

import { allPortableBrowserAdapterDescriptors } from '../lib/portable-browser/catalog/registry-data.ts'
import {
  describeBrowserAdapterBuyerReadiness,
  summarizeCatalogBuyerReadiness,
} from '../lib/portable-browser/browser-buyer-readiness.ts'

/** Vendors whose buyer contract is declared. Move an id here only when its entry states its fields. */
const CONTRACTED = [
  'aws-agentcore-browser',
  'azure-playwright',
  'browserstack',
  'lambdatest',
  'sauce-labs',
  'selenium-grid',
]

const byId = (id: string) => {
  const found = allPortableBrowserAdapterDescriptors.find((d) => d.adapterId === id)
  assert.ok(found, `${id} is not in the catalog`)
  return found!
}

test('the contracted vendors declare what a buyer must supply', () => {
  for (const id of CONTRACTED) {
    const fields = byId(id).configurationFieldDefinitions
    assert.ok(fields.length > 0, `${id} declares no configuration fields`)
    for (const field of fields) {
      assert.ok(field.key.length > 0, `${id} has a field with no key`)
      assert.ok(field.description.length > 20, `${id}.${field.key} needs a description a buyer can act on`)
    }
  }
})

test('every credential is an opaque reference — never a field that could hold a secret', () => {
  for (const id of CONTRACTED) {
    for (const field of byId(id).configurationFieldDefinitions) {
      if (!/credential|secret|token|key|password/i.test(field.key)) continue
      assert.equal(field.type, 'opaque_reference', `${id}.${field.key} must be an opaque_reference`)
    }
  }
})

test('a pasted API key is REJECTED where a vault reference belongs', () => {
  const readiness = describeBrowserAdapterBuyerReadiness(byId('browserstack'), {
    hubEndpoint: 'https://hub.example.com',
    // Deliberately self-labelling. A fixture must not LOOK like a real vendor key, or it
    // trips secret scanners and alarms anyone reading the repo — including a buyer's
    // security review. It still has to match the detector, which is the point of the test.
    credentialReference: 'token_EXAMPLE0PLACEHOLDER0NOTAREALKEY',
    approvedOrigins: 'https://app.example.com',
  })
  assert.equal(readiness.ready, false)
  assert.ok(readiness.problems.some((p) => p.key === 'credentialReference' && p.problem === 'raw_secret'))
})

test('a complete configuration is reported ready, with the vendor name in plain language', () => {
  const readiness = describeBrowserAdapterBuyerReadiness(byId('browserstack'), {
    hubEndpoint: 'https://hub.example.com',
    credentialReference: 'vault://browserstack/automate',
    approvedOrigins: 'https://app.example.com',
  })
  assert.equal(readiness.ready, true)
  assert.deepEqual(readiness.problems, [])
  assert.match(readiness.summary, /BrowserStack/)
})

test('missing values are listed by field, not reported as a generic failure', () => {
  const readiness = describeBrowserAdapterBuyerReadiness(byId('azure-playwright'), {})
  assert.equal(readiness.ready, false)
  const missing = readiness.problems.filter((p) => p.problem === 'missing').map((p) => p.key).sort()
  assert.deepEqual(missing, ['approvedOrigins', 'credentialReference', 'region', 'workspaceEndpoint'])
})

test('a plaintext endpoint is refused — enterprise transport is encrypted', () => {
  const readiness = describeBrowserAdapterBuyerReadiness(byId('lambdatest'), {
    hubEndpoint: 'http://hub.example.com',
    credentialReference: 'vault://lambdatest/grid',
    approvedOrigins: 'https://app.example.com',
  })
  assert.ok(readiness.problems.some((p) => p.key === 'hubEndpoint' && p.problem === 'not_permitted_scheme'))
})

test('an enum value outside the vendor options is refused', () => {
  const readiness = describeBrowserAdapterBuyerReadiness(byId('sauce-labs'), {
    hubEndpoint: 'https://ondemand.example.com',
    credentialReference: 'vault://saucelabs/grid',
    dataCentre: 'mars-north-1',
    approvedOrigins: 'https://app.example.com',
  })
  assert.ok(readiness.problems.some((p) => p.key === 'dataCentre' && p.problem === 'not_in_options'))
})

test('an optional field may be omitted — selenium grid inside a buyer network needs no credential', () => {
  const readiness = describeBrowserAdapterBuyerReadiness(byId('selenium-grid'), {
    hubEndpoint: 'https://grid.internal.example.com',
    approvedOrigins: 'https://app.example.com',
  })
  assert.equal(readiness.ready, true)
})

test('a vendor that declares NO contract is never reported ready, even with a full configuration', () => {
  const undeclared = allPortableBrowserAdapterDescriptors.find(
    (d) => !CONTRACTED.includes(d.adapterId) && d.configurationFieldDefinitions.length === 0,
  )
  assert.ok(undeclared, 'expected at least one vendor still without a contract')
  const readiness = describeBrowserAdapterBuyerReadiness(undeclared!, { anything: 'at all' })
  assert.equal(readiness.declaresConfigurationContract, false)
  assert.equal(readiness.ready, false)
  assert.match(readiness.summary, /cannot tell what to supply/i)
})

test('the catalog-wide gap is a number someone can watch shrink', () => {
  const summary = summarizeCatalogBuyerReadiness(allPortableBrowserAdapterDescriptors)
  assert.equal(summary.total, allPortableBrowserAdapterDescriptors.length)
  assert.deepEqual(summary.withContract, [...CONTRACTED].sort())
  assert.equal(summary.withContract.length + summary.withoutContract.length, summary.total)
  assert.ok(summary.withoutContract.length > 0, 'when this hits zero, every vendor is buyer-ready')
})

test('a typo in a supplied key is surfaced rather than silently ignored', () => {
  const readiness = describeBrowserAdapterBuyerReadiness(byId('lambdatest'), {
    hubEndpont: 'https://hub.example.com',
    credentialReference: 'vault://lambdatest/grid',
    approvedOrigins: 'https://app.example.com',
  })
  assert.deepEqual(readiness.unrecognizedKeys, ['hubEndpont'])
  assert.ok(readiness.problems.some((p) => p.key === 'hubEndpoint' && p.problem === 'missing'))
})
