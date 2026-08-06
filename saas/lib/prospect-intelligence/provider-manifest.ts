// saas/lib/prospect-intelligence/provider-manifest.ts

import {
  PROSPECT_PROVIDER_CAPABILITIES,
  type ProspectProviderCapability,
} from './contracts.ts'

export type ProspectProviderAuthentication = Readonly<{
  type: 'api_key' | 'oauth2' | 'basic' | 'bearer' | 'custom_header' | 'none'
  secretReferenceNames: readonly string[]
}>

export type ProspectProviderManifest = Readonly<{
  schemaVersion: '1.0'
  providerId: string
  displayName: string
  baseUrl: string
  authentication: ProspectProviderAuthentication
  capabilities: readonly ProspectProviderCapability[]
  requestTimeoutMs: number
  maximumRequestsPerMinute?: number
  enabled: false
}>

const PROVIDER_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SECRET_REFERENCE_PATTERN = /^[A-Z][A-Z0-9_]*$/

export function validateProspectProviderManifest(
  value: unknown,
): asserts value is ProspectProviderManifest {
  if (!value || typeof value !== 'object') {
    throw new Error('PROSPECT_PROVIDER_MANIFEST_INVALID')
  }

  const manifest = value as Record<string, unknown>

  if (manifest.schemaVersion !== '1.0') {
    throw new Error('PROSPECT_PROVIDER_SCHEMA_VERSION_UNSUPPORTED')
  }

  if (
    typeof manifest.providerId !== 'string' ||
    !PROVIDER_ID_PATTERN.test(manifest.providerId)
  ) {
    throw new Error('PROSPECT_PROVIDER_ID_INVALID')
  }

  if (
    typeof manifest.displayName !== 'string' ||
    manifest.displayName.trim().length === 0
  ) {
    throw new Error('PROSPECT_PROVIDER_DISPLAY_NAME_INVALID')
  }

  if (typeof manifest.baseUrl !== 'string') {
    throw new Error('PROSPECT_PROVIDER_BASE_URL_INVALID')
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(manifest.baseUrl)
  } catch {
    throw new Error('PROSPECT_PROVIDER_BASE_URL_INVALID')
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new Error('PROSPECT_PROVIDER_HTTPS_REQUIRED')
  }

  if (!Array.isArray(manifest.capabilities) || manifest.capabilities.length === 0) {
    throw new Error('PROSPECT_PROVIDER_CAPABILITIES_REQUIRED')
  }

  for (const capability of manifest.capabilities) {
    if (
      typeof capability !== 'string' ||
      !PROSPECT_PROVIDER_CAPABILITIES.includes(
        capability as ProspectProviderCapability,
      )
    ) {
      throw new Error('PROSPECT_PROVIDER_CAPABILITY_INVALID')
    }
  }

  if (
    typeof manifest.requestTimeoutMs !== 'number' ||
    !Number.isInteger(manifest.requestTimeoutMs) ||
    manifest.requestTimeoutMs < 100 ||
    manifest.requestTimeoutMs > 60_000
  ) {
    throw new Error('PROSPECT_PROVIDER_TIMEOUT_INVALID')
  }

  if (manifest.enabled !== false) {
    throw new Error('PROSPECT_PROVIDER_MUST_START_DISABLED')
  }

  if (!manifest.authentication || typeof manifest.authentication !== 'object') {
    throw new Error('PROSPECT_PROVIDER_AUTHENTICATION_INVALID')
  }

  const authentication = manifest.authentication as Record<string, unknown>
  const supportedAuthenticationTypes = [
    'api_key',
    'oauth2',
    'basic',
    'bearer',
    'custom_header',
    'none',
  ]

  if (
    typeof authentication.type !== 'string' ||
    !supportedAuthenticationTypes.includes(authentication.type)
  ) {
    throw new Error('PROSPECT_PROVIDER_AUTHENTICATION_INVALID')
  }

  if (!Array.isArray(authentication.secretReferenceNames)) {
    throw new Error('PROSPECT_PROVIDER_SECRET_REFERENCES_INVALID')
  }

  for (const name of authentication.secretReferenceNames) {
    if (typeof name !== 'string' || !SECRET_REFERENCE_PATTERN.test(name)) {
      throw new Error('PROSPECT_PROVIDER_SECRET_REFERENCE_INVALID')
    }
  }

  const forbiddenManifestKeys = [
    'apiKey',
    'api_key',
    'token',
    'accessToken',
    'access_token',
    'clientSecret',
    'client_secret',
    'password',
  ]

  for (const key of forbiddenManifestKeys) {
    if (Object.prototype.hasOwnProperty.call(manifest, key)) {
      throw new Error('PROSPECT_PROVIDER_SECRET_VALUE_FORBIDDEN')
    }
  }
}
