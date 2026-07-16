const secretPattern = /(secret|token|cookie|password|authorization|api[_-]?key|credential|bearer\s+[a-z0-9._-]+)/gi
export function sanitizeDatabaseMessage(message: unknown): string {
  const text = typeof message === 'string' ? message : 'coordination database operation failed'
  return text.replace(secretPattern, '[redacted]').slice(0, 240)
}
export class CoordinationDatabaseError extends Error { readonly code: string; constructor(code: string, message: unknown) { super(sanitizeDatabaseMessage(message)); this.name='CoordinationDatabaseError'; this.code=code } }
export function normalizeDatabaseError(error: unknown, fallback = 'coordination_store_unavailable'): CoordinationDatabaseError {
  if (error instanceof CoordinationDatabaseError) return error
  const message = typeof error === 'object' && error && 'message' in error ? (error as { message?: unknown }).message : error
  return new CoordinationDatabaseError(fallback, message)
}
