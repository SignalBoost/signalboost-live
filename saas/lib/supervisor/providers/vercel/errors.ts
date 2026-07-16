export type VercelErrorCategory = 'auth' | 'unavailable' | 'invalid_config' | 'unknown'

export class VercelObserverError extends Error {
  readonly category: VercelErrorCategory
  readonly status?: number
  readonly retryAfterMs?: number
  constructor(message: string, category: VercelErrorCategory = 'unknown', status?: number, retryAfterMs?: number) {
    super(message)
    this.name = 'VercelObserverError'
    this.category = category
    this.status = status
    this.retryAfterMs = retryAfterMs
  }
}

export function isAuthError(error: unknown): boolean { return error instanceof VercelObserverError && error.category === 'auth' }
export function isRetryableProviderError(error: unknown): boolean { return error instanceof VercelObserverError && error.category === 'unavailable' }
