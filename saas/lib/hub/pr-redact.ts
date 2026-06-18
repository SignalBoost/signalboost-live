// lib/hub/pr-redact.ts
// Display-only redaction for infrastructure-PR payloads. The cockpit shows
// staged provider payloads for human review; those payloads can carry real
// secrets (API keys, tokens, env-var values). This masks sensitive values
// BEFORE they leave the server for the browser.
//
// IMPORTANT: redaction is applied ONLY on the read-for-display path (the GET
// routes). Merge reads the stored payload server-side and replays the REAL
// values, so it must never see redacted data — do not call this in the merge
// path or inside the engine read functions.

const SENSITIVE_KEY =
  /(secret|token|password|passwd|credential|private|api[_-]?key|access[_-]?key|secret[_-]?key|client[_-]?secret|service[_-]?role|bearer|auth[_-]?token|signing|webhook[_-]?secret)/i

// Field names that, in this infra context, hold the secret payload itself.
const VALUE_FIELDS = new Set(['value', 'secret', 'token', 'password'])

const MASK = '••••••••'

function maskString(s: string): string {
  if (!s) return s
  // keep a short hint so an owner can still recognise WHICH credential it is,
  // without exposing enough to use it: first 2 + last 2 for longer strings.
  if (s.length <= 6) return MASK
  return `${s.slice(0, 2)}${MASK}${s.slice(-2)}`
}

function redactValue(val: unknown): unknown {
  if (typeof val === 'string') return maskString(val)
  if (typeof val === 'number' || typeof val === 'boolean') return MASK
  if (Array.isArray(val)) return val.map(redactValue)
  if (val && typeof val === 'object') return redactObject(val as Record<string, unknown>)
  return MASK
}

function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    const sensitive = SENSITIVE_KEY.test(k) || VALUE_FIELDS.has(k.toLowerCase())
    if (sensitive) {
      out[k] = redactValue(v)
    } else if (v && typeof v === 'object') {
      out[k] = Array.isArray(v) ? v.map(x => (x && typeof x === 'object' ? redactObject(x as any) : x)) : redactObject(v as any)
    } else {
      out[k] = v
    }
  }
  return out
}

/** Redact one payload object (deep). Returns a new object; input untouched. */
export function redactPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload
  return Array.isArray(payload) ? payload.map(redactValue) : redactObject(payload as Record<string, unknown>)
}

/** Return a display-safe clone of a PR with every step.payload redacted. */
export function redactPrForDisplay<T extends { steps?: any }>(pr: T): T {
  if (!pr || typeof pr !== 'object') return pr
  const steps = Array.isArray((pr as any).steps) ? (pr as any).steps : null
  if (!steps) return pr
  return {
    ...pr,
    steps: steps.map((s: any) => (s && typeof s === 'object' ? { ...s, payload: redactPayload(s.payload) } : s)),
  }
}

export function redactPrsForDisplay<T extends { steps?: any }>(prs: T[]): T[] {
  return Array.isArray(prs) ? prs.map(redactPrForDisplay) : prs
}
