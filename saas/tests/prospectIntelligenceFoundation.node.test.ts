// saas/tests/prospectIntelligenceFoundation.node.test.ts

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PROSPECT_INTELLIGENCE_FEATURE_FLAGS,
  PROSPECT_INTELLIGENCE_LANGUAGES,
  PROSPECT_PROVIDER_CAPABILITIES,
  PROSPECT_PROVIDER_HEALTH_STATES,
  assertNoSecretMaterial,
  normalizeProspectIntelligenceLanguage,
} from '../lib/prospect-intelligence/contracts.ts'
import { PROSPECT_INTELLIGENCE_COPY } from '../lib/prospect-intelligence/copy.ts'
import { validateProspectProviderManifest } from '../lib/prospect-intelligence/provider-manifest.ts'

test('prospect intelligence supports exactly the five platform languages', () => {
  assert.deepEqual(PROSPECT_INTELLIGENCE_LANGUAGES, ['en', 'es', 'pt', 'pl', 'ru'])
})

test('region tags normalize to the supported base language', () => {
  assert.equal(normalizeProspectIntelligenceLanguage('pt-BR'), 'pt')
  assert.equal(normalizeProspectIntelligenceLanguage('es-MX'), 'es')
  assert.equal(normalizeProspectIntelligenceLanguage('pl-PL'), 'pl')
  assert.equal(normalizeProspectIntelligenceLanguage('ru_RU'), 'ru')
  assert.equal(normalizeProspectIntelligenceLanguage('fr-FR'), 'en')
})

test('all foundation copy keys have five-language parity', () => {
  const canonicalKeys = Object.keys(PROSPECT_INTELLIGENCE_COPY.en).sort()

  for (const language of PROSPECT_INTELLIGENCE_LANGUAGES) {
    assert.deepEqual(Object.keys(PROSPECT_INTELLIGENCE_COPY[language]).sort(), canonicalKeys)

    for (const key of canonicalKeys) {
      const value = PROSPECT_INTELLIGENCE_COPY[language][
        key as keyof (typeof PROSPECT_INTELLIGENCE_COPY)['en']
      ]
      assert.equal(typeof value, 'string')
      assert.ok(value.trim().length > 0)
    }
  }
})

test('machine capability and health identifiers remain stable', () => {
  assert.ok(PROSPECT_PROVIDER_CAPABILITIES.includes('company_search'))
  assert.ok(PROSPECT_PROVIDER_CAPABILITIES.includes('crm_write'))
  assert.ok(PROSPECT_PROVIDER_HEALTH_STATES.includes('authentication_failed'))
  assert.ok(PROSPECT_PROVIDER_HEALTH_STATES.includes('disabled'))
})

test('all execution-capable feature flags are disabled by default', () => {
  for (const value of Object.values(PROSPECT_INTELLIGENCE_FEATURE_FLAGS)) {
    assert.equal(value, false)
  }
})

test('BYOP manifests require HTTPS, references instead of secret values, and disabled state', () => {
  const manifest = {
    schemaVersion: '1.0',
    providerId: 'customer-registry',
    displayName: 'Customer Registry',
    baseUrl: 'https://registry.example.com',
    authentication: {
      type: 'api_key',
      secretReferenceNames: ['CUSTOMER_REGISTRY_API_KEY'],
    },
    capabilities: ['company_search', 'company_profile'],
    requestTimeoutMs: 10_000,
    maximumRequestsPerMinute: 60,
    enabled: false,
  } as const

  assert.doesNotThrow(() => validateProspectProviderManifest(manifest))

  assert.throws(
    () =>
      validateProspectProviderManifest({
        ...manifest,
        baseUrl: 'http://registry.example.com',
      }),
    /PROSPECT_PROVIDER_HTTPS_REQUIRED/,
  )

  assert.throws(
    () =>
      validateProspectProviderManifest({
        ...manifest,
        enabled: true,
      }),
    /PROSPECT_PROVIDER_MUST_START_DISABLED/,
  )

  assert.throws(
    () =>
      validateProspectProviderManifest({
        ...manifest,
        apiKey: 'must-not-be-stored',
      }),
    /PROSPECT_PROVIDER_SECRET_VALUE_FORBIDDEN/,
  )
})

test('normalized records reject common secret-bearing keys', () => {
  assert.doesNotThrow(() =>
    assertNoSecretMaterial({ providerId: 'apollo', companyId: 'company-123' }),
  )

  assert.throws(
    () => assertNoSecretMaterial({ api_key: 'secret' }),
    /PROSPECT_PROVIDER_SECRET_MATERIAL_REJECTED/,
  )

  assert.throws(
    () => assertNoSecretMaterial({ access_token: 'secret' }),
    /PROSPECT_PROVIDER_SECRET_MATERIAL_REJECTED/,
  )
})
