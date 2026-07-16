import type { SerializableValue } from '../incident-schema.ts'

const SECRET_KEY = /(authorization|cookie|password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key|secret|storageState|localStorage|sessionStorage|browserStorage)/i
const SECRET_VALUE = /(bearer\s+[a-z0-9._~+\/-]+=*|sk-[a-z0-9]{12,}|xox[baprs]-[a-z0-9-]+|-----BEGIN [A-Z ]*PRIVATE KEY-----|postgres(?:ql)?:\/\/[^\s:@]+:[^\s@]+@|[?&](?:token|key|secret|password|access_token|refresh_token)=[^\s&]+)/gi
const MAX_STRING = 600
const MAX_KEYS = 80
const MAX_DEPTH = 8
const MAX_ARRAY = 80
export const REDACTED = '[redacted]'

export function sanitizeForPersistence(value: unknown, depth = 0, seen = new WeakSet<object>()): SerializableValue {
  if (depth > MAX_DEPTH) return '[truncated]'
  if (value == null || typeof value === 'boolean') return value as SerializableValue
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') return value.replace(SECRET_VALUE, REDACTED).replace(/\n\s*at\s+[^\n]+/g, '').slice(0, MAX_STRING)
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') return '[non-serializable]'
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY).map(v => sanitizeForPersistence(v, depth + 1, seen))
  if (typeof value === 'object') {
    if (seen.has(value)) return '[circular]'
    if (Object.getPrototypeOf(value) !== Object.prototype) return '[non-serializable]'
    seen.add(value)
    const out: Record<string, SerializableValue> = {}
    for (const [key, nested] of Object.entries(value).slice(0, MAX_KEYS)) out[SECRET_KEY.test(key) ? 'redacted' : key] = SECRET_KEY.test(key) ? REDACTED : sanitizeForPersistence(nested, depth + 1, seen)
    seen.delete(value)
    return out
  }
  return '[non-serializable]'
}
export function sanitizeError(error: unknown): { code: string; message: string } {
  const any = error as { code?: unknown; message?: unknown; name?: unknown }
  return { code: String(any?.code || any?.name || 'error').replace(/[^a-z0-9_.-]/gi, '_').slice(0, 80), message: String(any?.message || error || 'Unknown error').replace(SECRET_VALUE, REDACTED).replace(/\n\s*at\s+[^\n]+/g, '').slice(0, 600) }
}
export function containsSecretText(value: unknown): boolean { return JSON.stringify(sanitizeForPersistence(value)).includes('authorization') === false && SECRET_VALUE.test(JSON.stringify(value ?? '')) }
