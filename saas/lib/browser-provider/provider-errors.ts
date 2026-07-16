export type BrowserProviderErrorCode =
  | 'duplicate_provider'
  | 'unknown_provider'
  | 'unknown_capability'
  | 'duplicate_capability'
  | 'unknown_origin'
  | 'duplicate_origin'
  | 'invalid_origin'
  | 'unknown_navigation'
  | 'duplicate_navigation'
  | 'invalid_navigation'
  | 'unknown_selector'
  | 'duplicate_selector'
  | 'invalid_selector'
  | 'unknown_evidence'
  | 'duplicate_evidence'
  | 'unknown_verification'
  | 'duplicate_verification'
  | 'invalid_provider'
  | 'invalid_provider_health'
  | 'invalid_provider_version'
  | 'capability_suspended'
  | 'provider_suspended'
  | 'immutable_read_only'

export class BrowserProviderError extends Error {
  readonly code: BrowserProviderErrorCode

  // Human-readable diagnostics are intentionally independent from the machine-readable code union.
  constructor(code: BrowserProviderErrorCode, message: string = code) {
    super(message)
    this.name = 'BrowserProviderError'
    this.code = code
  }
}
