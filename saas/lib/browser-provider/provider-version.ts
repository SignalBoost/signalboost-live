import { BrowserProviderError } from './provider-errors.ts'

export const BPAL_SCHEMA_VERSION = '1.0.0' as const

export interface BrowserProviderVersion {
  adapterVersion: string
  capabilityVersion: string
  schemaVersion: typeof BPAL_SCHEMA_VERSION
  updatedAt?: string
}

export type ProviderVersion = BrowserProviderVersion

export function assertBrowserProviderVersion(version: BrowserProviderVersion): Readonly<BrowserProviderVersion> {
  if (!version.adapterVersion || !version.capabilityVersion || version.schemaVersion !== BPAL_SCHEMA_VERSION) {
    throw new BrowserProviderError('invalid_provider_version')
  }
  if (version.updatedAt && new Date(version.updatedAt).toISOString() !== version.updatedAt) {
    throw new BrowserProviderError('invalid_provider_version')
  }
  return Object.freeze({ ...version })
}

export function versionKey(version: BrowserProviderVersion): string {
  return `${version.adapterVersion}|${version.capabilityVersion}|${version.schemaVersion}`
}
