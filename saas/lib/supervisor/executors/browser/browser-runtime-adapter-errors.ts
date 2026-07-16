export class BrowserRuntimeAdapterError extends Error {
  readonly code: string
  readonly category: string
  constructor(code: string, message: string, category = 'compatibility') {
    super(message)
    this.name = 'BrowserRuntimeAdapterError'
    this.code = code
    this.category = category
  }
}
