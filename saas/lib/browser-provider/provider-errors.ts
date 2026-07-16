export type BrowserProviderErrorCode =
  | 'duplicate_provider'
  | 'unknown_provider'
  | 'unknown_capability'
  | 'invalid_provider'
  | 'immutable_read_only'

export class BrowserProviderError extends Error {
  readonly code: BrowserProviderErrorCode

  constructor(code: BrowserProviderErrorCode, message: string = code) {
    super(message)
    this.name = 'BrowserProviderError'
    this.code = code
  }
}
