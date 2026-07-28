import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'


type Dictionary = Record<string, string>
type LocaleFile = Record<string, { supervisorSoc: Dictionary }>

const supportedLocales = ['en', 'es', 'pt', 'pl', 'ru'] as const
const locales = JSON.parse(
  hydrateLocalizedSource(readFileSync(new URL('../lib/i18n/supervisorSocLocales.json', import.meta.url), 'utf8')),
) as LocaleFile

const criticalOperatorKeys = [
  'title',
  'subtitle',
  'adminOnly',
  'readOnly',
  'platformHealth',
  'providerHealth',
  'activeWork',
  'incidentQueue',
  'auditTimeline',
  'verification',
  'healthMetrics',
  'filters',
  'search',
  'overallState',
  'lastObservation',
  'lastVerification',
  'uptime',
  'activeInstances',
  'provider',
  'status',
  'currentWork',
  'openIncidents',
  'currentOwner',
  'currentLease',
  'verificationStatus',
  'environment',
  'assignedSupervisor',
  'leaseStatus',
  'currentStage',
  'verificationStage',
  'evidence',
  'selectedChannel',
  'metadata',
  'verified',
  'partiallyVerified',
  'unverifiable',
  'failed',
  'rejected',
  'queueDepth',
  'noData',
  'supervisorCluster',
  'leaseOwner',
  'lastReconciliation',
] as const

const mustBeLocalizedKeys = [
  'title',
  'subtitle',
  'adminOnly',
  'readOnly',
  'platformHealth',
  'providerHealth',
  'activeWork',
  'incidentQueue',
  'auditTimeline',
  'healthMetrics',
  'filters',
  'search',
  'overallState',
  'lastObservation',
  'lastVerification',
  'uptime',
  'activeInstances',
  'currentWork',
  'openIncidents',
  'currentOwner',
  'currentLease',
  'verificationStatus',
  'environment',
  'assignedSupervisor',
  'leaseStatus',
  'currentStage',
  'verificationStage',
  'selectedChannel',
  'metadata',
  'partiallyVerified',
  'unverifiable',
  'failed',
  'rejected',
  'queueDepth',
  'noData',
  'supervisorCluster',
  'leaseOwner',
  'lastReconciliation',
] as const

test('Supervisor operator labels exist in all five supported languages', () => {
  assert.deepEqual(Object.keys(locales).sort(), [...supportedLocales].sort())

  for (const locale of supportedLocales) {
    const dictionary = locales[locale]?.supervisorSoc
    assert.ok(dictionary, `${locale}.supervisorSoc is required`)

    for (const key of criticalOperatorKeys) {
      assert.equal(typeof dictionary[key], 'string', `${locale}.${key} must be a string`)
      assert.ok(dictionary[key].trim().length > 0, `${locale}.${key} must not be empty`)
    }
  }
})

test('critical non-English operator labels do not silently fall back to English', () => {
  const english = locales.en.supervisorSoc

  for (const locale of supportedLocales.filter(locale => locale !== 'en')) {
    const dictionary = locales[locale].supervisorSoc
    for (const key of mustBeLocalizedKeys) {
      assert.notEqual(
        dictionary[key].trim(),
        english[key].trim(),
        `${locale}.${key} still uses the English label`,
      )
    }
  }
})

test('all Supervisor locale dictionaries keep exact key parity', () => {
  const englishKeys = Object.keys(locales.en.supervisorSoc).sort()
  for (const locale of supportedLocales.filter(locale => locale !== 'en')) {
    assert.deepEqual(
      Object.keys(locales[locale].supervisorSoc).sort(),
      englishKeys,
      `${locale} Supervisor labels must match the English key set`,
    )
  }
})
