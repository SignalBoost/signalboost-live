import type { ProviderCapability } from './provider-capability.ts'
import { capabilityMaturities, riskClasses } from './provider-capability.ts'
import type { OriginProfile } from './provider-origin.ts'
import type { NavigationProfile } from './provider-navigation.ts'
import type { ProviderSelector } from './provider-selector.ts'
import type { VerificationProfile } from './provider-verification.ts'
import type { EvidenceProfile } from './provider-evidence.ts'
import type { ProviderHealth } from './provider-health.ts'
import { providerHealthStates } from './provider-health.ts'
import type { ProviderVersion } from './provider-version.ts'
import { BPAL_SCHEMA_VERSION, versionKey } from './provider-version.ts'
import { BrowserProviderError } from './provider-errors.ts'

export type Locale = 'en' | 'es' | 'pt' | 'pl' | 'ru'
export type LocalizedText = Readonly<Record<Locale, string>>
export type ExecutionMode = 'read_only'

export interface BrowserProviderAdapter {
  id: string
  displayName: LocalizedText
  capabilities: readonly ProviderCapability[]
  origins: readonly OriginProfile[]
  selectors: readonly ProviderSelector[]
  navigation: readonly NavigationProfile[]
  verification: readonly VerificationProfile[]
  evidence: readonly EvidenceProfile[]
  health: ProviderHealth
  version: ProviderVersion
  executionModes: readonly ExecutionMode[]
  autoFailoverSupported: boolean
  browserOnDemandSupported: boolean
  readOnlySupported: true
  productionSupported: boolean
}

const identifierPattern = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/
const referencePattern = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/
const semanticVersionPattern = /^\d+\.\d+\.\d+$/
const locales: readonly Locale[] = ['en', 'es', 'pt', 'pl', 'ru']

function invalid(detail: string): never {
  throw new BrowserProviderError('invalid_provider', `invalid_provider:${detail}`)
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!isPlainRecord(value)) invalid(`${label}_shape`)
}

function assertExactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const expected = [...keys].sort()
  const actual = Object.keys(value).sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    invalid(`${label}_fields`)
  }
}

function assertIdentifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length > 128 || !identifierPattern.test(value)) invalid(label)
}

function assertReference(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length > 128 || !referencePattern.test(value)) invalid(label)
}

function assertBoundedText(value: unknown, label: string, maximum = 512): asserts value is string {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0 || value.length > maximum) {
    invalid(label)
  }
}

function assertBoolean(value: unknown, label: string): asserts value is boolean {
  if (typeof value !== 'boolean') invalid(label)
}

function assertArray(value: unknown, label: string): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 256) invalid(label)
}

function assertUniqueIds(items: readonly { id: string }[], label: string): void {
  const seen = new Set<string>()
  for (const item of items) {
    if (seen.has(item.id)) invalid(`duplicate_${label}`)
    seen.add(item.id)
  }
}

function assertUniqueReferences(values: readonly string[], label: string): void {
  const seen = new Set<string>()
  for (const value of values) {
    assertReference(value, label)
    if (seen.has(value)) invalid(`duplicate_${label}`)
    seen.add(value)
  }
}

function assertVersion(value: unknown, label: string): asserts value is ProviderVersion {
  assertRecord(value, label)
  assertExactKeys(value, ['provider', 'capability', 'schema'], label)
  if (
    typeof value.provider !== 'string' ||
    !semanticVersionPattern.test(value.provider) ||
    typeof value.capability !== 'string' ||
    !semanticVersionPattern.test(value.capability) ||
    value.schema !== BPAL_SCHEMA_VERSION
  ) {
    invalid(label)
  }
}

function assertLocalizedText(value: unknown): asserts value is LocalizedText {
  assertRecord(value, 'display_name')
  assertExactKeys(value, locales, 'display_name')
  for (const locale of locales) assertBoundedText(value[locale], `display_name_${locale}`, 120)
}

function assertHealth(value: unknown): asserts value is ProviderHealth {
  assertRecord(value, 'health')
  const keys = Object.prototype.hasOwnProperty.call(value, 'details')
    ? ['state', 'checkedAt', 'details']
    : ['state', 'checkedAt']
  assertExactKeys(value, keys, 'health')
  if (!providerHealthStates.includes(value.state as never)) invalid('health_state')
  if (typeof value.checkedAt !== 'string') invalid('health_checked_at')
  const checkedAt = new Date(value.checkedAt)
  if (!Number.isFinite(checkedAt.getTime()) || checkedAt.toISOString() !== value.checkedAt) {
    invalid('health_checked_at')
  }
  if (value.details !== undefined) assertBoundedText(value.details, 'health_details', 512)
}

function assertOrigin(value: unknown): asserts value is OriginProfile {
  assertRecord(value, 'origin')
  assertExactKeys(value, ['id', 'origin', 'readOnly', 'schemaVersion'], 'origin')
  assertIdentifier(value.id, 'origin_id')
  if (value.readOnly !== true || value.schemaVersion !== BPAL_SCHEMA_VERSION) invalid('origin_read_only')
  if (typeof value.origin !== 'string') invalid('origin_url')

  let parsed: URL
  try {
    parsed = new URL(value.origin)
  } catch {
    invalid('origin_url')
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.username !== '' ||
    parsed.href.includes('@') ||
    parsed.pathname !== '/' ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    parsed.origin !== value.origin
  ) {
    invalid('origin_url')
  }
}

function assertNavigation(value: unknown): asserts value is NavigationProfile {
  assertRecord(value, 'navigation')
  assertExactKeys(value, ['id', 'origin', 'pathTemplate', 'readOnly', 'schemaVersion'], 'navigation')
  assertIdentifier(value.id, 'navigation_id')
  assertIdentifier(value.origin, 'navigation_origin')
  assertBoundedText(value.pathTemplate, 'navigation_path', 512)
  if (
    !value.pathTemplate.startsWith('/') ||
    value.pathTemplate.includes('://') ||
    value.pathTemplate.includes('?') ||
    value.pathTemplate.includes('#') ||
    value.readOnly !== true ||
    value.schemaVersion !== BPAL_SCHEMA_VERSION
  ) {
    invalid('navigation_path')
  }
}

function assertSelector(value: unknown): asserts value is ProviderSelector {
  assertRecord(value, 'selector')
  assertExactKeys(value, ['id', 'group', 'selector', 'readOnly', 'schemaVersion'], 'selector')
  assertIdentifier(value.id, 'selector_id')
  assertIdentifier(value.group, 'selector_group')
  assertBoundedText(value.selector, 'selector_value', 512)
  if (value.readOnly !== true || value.schemaVersion !== BPAL_SCHEMA_VERSION) invalid('selector_read_only')
}

function assertVerification(value: unknown): asserts value is VerificationProfile {
  assertRecord(value, 'verification')
  assertExactKeys(value, ['id', 'assertions', 'schemaVersion'], 'verification')
  assertIdentifier(value.id, 'verification_id')
  assertArray(value.assertions, 'verification_assertions')
  for (const assertion of value.assertions) assertBoundedText(assertion, 'verification_assertion', 256)
  if (value.schemaVersion !== BPAL_SCHEMA_VERSION) invalid('verification_schema')
}

function assertEvidence(value: unknown): asserts value is EvidenceProfile {
  assertRecord(value, 'evidence')
  assertExactKeys(
    value,
    ['id', 'expectedScreenshots', 'expectedReads', 'expectedMetadata', 'schemaVersion'],
    'evidence',
  )
  assertIdentifier(value.id, 'evidence_id')

  for (const [key, entries] of [
    ['evidence_screenshot', value.expectedScreenshots],
    ['evidence_read', value.expectedReads],
    ['evidence_metadata', value.expectedMetadata],
  ] as const) {
    assertArray(entries, key)
    assertUniqueReferences(entries as string[], key)
  }

  if (value.schemaVersion !== BPAL_SCHEMA_VERSION) invalid('evidence_schema')
}

function assertCapability(value: unknown, adapterVersion: ProviderVersion): asserts value is ProviderCapability {
  assertRecord(value, 'capability')
  assertExactKeys(
    value,
    [
      'id',
      'operation',
      'descriptionKey',
      'risk',
      'maturity',
      'readOnly',
      'supportsApi',
      'supportsBrowser',
      'supportsAutoFailover',
      'supportsBrowserOnDemand',
      'verificationProfile',
      'evidenceProfile',
      'navigationProfile',
      'allowedOrigins',
      'version',
    ],
    'capability',
  )
  assertIdentifier(value.id, 'capability_id')
  assertIdentifier(value.operation, 'capability_operation')
  assertBoundedText(value.descriptionKey, 'capability_description_key', 256)
  if (!riskClasses.includes(value.risk as never) || value.risk !== 'read_only') invalid('capability_risk')
  if (!capabilityMaturities.includes(value.maturity as never)) invalid('capability_maturity')
  if (value.readOnly !== true) invalid('capability_read_only')
  assertBoolean(value.supportsApi, 'capability_api_support')
  assertBoolean(value.supportsBrowser, 'capability_browser_support')
  assertBoolean(value.supportsAutoFailover, 'capability_auto_failover_support')
  assertBoolean(value.supportsBrowserOnDemand, 'capability_on_demand_support')
  assertIdentifier(value.verificationProfile, 'capability_verification')
  assertIdentifier(value.evidenceProfile, 'capability_evidence')
  assertIdentifier(value.navigationProfile, 'capability_navigation')
  assertArray(value.allowedOrigins, 'capability_origins')
  assertUniqueReferences(value.allowedOrigins as string[], 'capability_origin')
  assertVersion(value.version, 'capability_version')
  if (versionKey(value.version) !== versionKey(adapterVersion)) invalid('capability_version_mismatch')
}

export function assertProviderAdapter(value: unknown): asserts value is BrowserProviderAdapter {
  assertRecord(value, 'provider')
  assertExactKeys(
    value,
    [
      'id',
      'displayName',
      'capabilities',
      'origins',
      'selectors',
      'navigation',
      'verification',
      'evidence',
      'health',
      'version',
      'executionModes',
      'autoFailoverSupported',
      'browserOnDemandSupported',
      'readOnlySupported',
      'productionSupported',
    ],
    'provider',
  )

  assertIdentifier(value.id, 'provider_id')
  assertLocalizedText(value.displayName)
  assertVersion(value.version, 'provider_version')
  assertHealth(value.health)
  assertBoolean(value.autoFailoverSupported, 'provider_auto_failover_support')
  assertBoolean(value.browserOnDemandSupported, 'provider_on_demand_support')
  assertBoolean(value.productionSupported, 'provider_production_support')
  if (value.readOnlySupported !== true) invalid('provider_read_only')
  if (!Array.isArray(value.executionModes) || value.executionModes.length !== 1 || value.executionModes[0] !== 'read_only') {
    invalid('provider_execution_modes')
  }

  assertArray(value.capabilities, 'provider_capabilities')
  assertArray(value.origins, 'provider_origins')
  assertArray(value.selectors, 'provider_selectors')
  assertArray(value.navigation, 'provider_navigation')
  assertArray(value.verification, 'provider_verification')
  assertArray(value.evidence, 'provider_evidence')

  for (const item of value.origins) assertOrigin(item)
  for (const item of value.navigation) assertNavigation(item)
  for (const item of value.selectors) assertSelector(item)
  for (const item of value.verification) assertVerification(item)
  for (const item of value.evidence) assertEvidence(item)
  for (const item of value.capabilities) assertCapability(item, value.version as ProviderVersion)

  const origins = value.origins as unknown as OriginProfile[]
  const navigation = value.navigation as unknown as NavigationProfile[]
  const selectors = value.selectors as unknown as ProviderSelector[]
  const verification = value.verification as unknown as VerificationProfile[]
  const evidence = value.evidence as unknown as EvidenceProfile[]
  const capabilities = value.capabilities as unknown as ProviderCapability[]

  assertUniqueIds(origins, 'origin')
  assertUniqueIds(navigation, 'navigation')
  assertUniqueIds(selectors, 'selector')
  assertUniqueIds(verification, 'verification')
  assertUniqueIds(evidence, 'evidence')
  assertUniqueIds(capabilities, 'capability')

  const originIds = new Set(origins.map(item => item.id))
  const navigationIds = new Set(navigation.map(item => item.id))
  const verificationIds = new Set(verification.map(item => item.id))
  const evidenceIds = new Set(evidence.map(item => item.id))
  const operations = new Set<string>()

  for (const item of navigation) {
    if (!originIds.has(item.origin)) invalid('navigation_origin_reference')
  }

  for (const item of capabilities) {
    if (operations.has(item.operation)) invalid('duplicate_capability_operation')
    operations.add(item.operation)
    if (!navigationIds.has(item.navigationProfile)) invalid('capability_navigation_reference')
    if (!verificationIds.has(item.verificationProfile)) invalid('capability_verification_reference')
    if (!evidenceIds.has(item.evidenceProfile)) invalid('capability_evidence_reference')
    if (item.allowedOrigins.some(originId => !originIds.has(originId))) invalid('capability_origin_reference')
    if (item.supportsAutoFailover && !value.autoFailoverSupported) invalid('capability_auto_failover_mismatch')
    if (item.supportsBrowserOnDemand && !value.browserOnDemandSupported) invalid('capability_on_demand_mismatch')
  }
}

export function freezeProvider(raw: BrowserProviderAdapter): BrowserProviderAdapter {
  assertProviderAdapter(raw)

  const version = Object.freeze({ ...raw.version })
  const capabilities = Object.freeze(
    raw.capabilities.map(item =>
      Object.freeze({
        ...item,
        allowedOrigins: Object.freeze([...item.allowedOrigins]),
        version: Object.freeze({ ...item.version }),
      }),
    ),
  )
  const origins = Object.freeze(raw.origins.map(item => Object.freeze({ ...item })))
  const selectors = Object.freeze(raw.selectors.map(item => Object.freeze({ ...item })))
  const navigation = Object.freeze(raw.navigation.map(item => Object.freeze({ ...item })))
  const verification = Object.freeze(
    raw.verification.map(item => Object.freeze({ ...item, assertions: Object.freeze([...item.assertions]) })),
  )
  const evidence = Object.freeze(
    raw.evidence.map(item =>
      Object.freeze({
        ...item,
        expectedScreenshots: Object.freeze([...item.expectedScreenshots]),
        expectedReads: Object.freeze([...item.expectedReads]),
        expectedMetadata: Object.freeze([...item.expectedMetadata]),
      }),
    ),
  )

  return Object.freeze({
    id: raw.id,
    displayName: Object.freeze({ ...raw.displayName }),
    capabilities,
    origins,
    selectors,
    navigation,
    verification,
    evidence,
    health: Object.freeze({ ...raw.health }),
    version,
    executionModes: Object.freeze([...raw.executionModes]),
    autoFailoverSupported: raw.autoFailoverSupported,
    browserOnDemandSupported: raw.browserOnDemandSupported,
    readOnlySupported: true,
    productionSupported: raw.productionSupported,
  })
}
