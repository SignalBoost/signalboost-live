// saas/lib/audit/processor.ts
//
// B2B Readiness Audit — Hub snapshot → LLM context pipeline.
//
// The Console Hub aggregates LIVE raw provider snapshots (GitHub, Supabase,
// Vercel, Stripe — and any future provider). Those raw objects can contain real
// credentials: bearer tokens, service-role JWTs, Stripe secret keys, env-var
// values, connection strings with embedded passwords. This module is the SINGLE
// egress gate that scrubs that material BEFORE any of it is handed to a
// third-party LLM (the ChatGPT / Claude orchestrator) to produce a readiness
// report.
//
// Relationship to lib/hub/pr-redact.ts:
//   pr-redact masks for OWNER DISPLAY in the cockpit and intentionally keeps a
//   2+2 hint (e.g. "gh••••xY") so a human can recognise WHICH credential it is.
//   That hint is unacceptable on the LLM path — we are shipping data to an
//   external model, so we leak NOTHING recognisable. This processor therefore
//   masks harder: full sentinel, no hint, plus value-level pattern scrubbing
//   that also catches secrets embedded inside otherwise-safe fields (a token in
//   a webhook URL, a key echoed inside an error string).
//
// Contract: pure + fail-safe. Never throws on malformed input, never mutates the
// caller's object, never blocks. Returns the house flat { ok, ..., error? } shape.

// ─────────────────────────────────────────────────────────────────────────────
// 1. Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The raw aggregate the Hub passes in. Provider keys are optional and loosely
 * typed on purpose — the sanitizer is structural (recursive) and must tolerate
 * whatever shape a given provider snapshot happens to have, including providers
 * added later. capturedAt / any extra metadata are passed through untouched
 * (after sanitization).
 */
export interface RawIntegrationSnapshot {
  github?: unknown
  supabase?: unknown
  vercel?: unknown
  stripe?: unknown
  capturedAt?: string
  [provider: string]: unknown
}

/** Per-run masking statistics — a cheap "secrets surface" metric for the audit. */
export interface SanitizeStats {
  /** Values replaced with [MASKED_PRESENT] (configured secret found). */
  masked: number
  /** Sensitive keys whose value was empty/null → [MISSING] (a config gap). */
  missing: number
  /** Inline secret tokens scrubbed from inside free-text/URL/error strings. */
  inlineScrubs: number
  /** Strings truncated for length, arrays capped, depth/cycle guards hit. */
  truncated: number
  guarded: number
}

export interface SanitizeResult {
  ok: boolean
  /** Deep clone of the input with every secret replaced by a sentinel. */
  data: unknown
  stats: SanitizeStats
  error?: string
}

export interface ProcessOptions {
  /**
   * Override the task framing handed to the orchestrator. When omitted, the
   * default B2B Readiness Audit instruction is used.
   */
  instruction?: string
  /** Cap per-string length before truncation. Default 600. */
  maxStringLength?: number
  /** Cap array items rendered/kept. Default 50. */
  maxArrayItems?: number
  /** Recursion depth guard. Default 12. */
  maxDepth?: number
  /**
   * Last-resort high-entropy catch for raw-key-shaped strings the named
   * patterns missed. Allow-listed against known-safe object IDs. Default true
   * (aggressive), per the readiness-audit threat model where over-masking is
   * the safe failure mode.
   */
  aggressiveEntropy?: boolean
}

export interface ProcessResult {
  ok: boolean
  /** Ready-to-send system-prompt context string for the orchestrator. */
  systemPrompt: string
  /** The sanitized object (also embedded in systemPrompt) for logging/inspection. */
  sanitized: unknown
  stats: SanitizeStats
  error?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Sentinels + masking patterns
// ─────────────────────────────────────────────────────────────────────────────

const MASK_PRESENT = '[MASKED_PRESENT]'
const MASK_MISSING = '[MISSING]'
const MASK_TRUNCATED = '[TRUNCATED]'
const MASK_CIRCULAR = '[CIRCULAR]'
const MASK_MAXDEPTH = '[MAX_DEPTH]'

// Key NAMES that carry a secret as their value → whole value is masked.
// Superset of pr-redact's SENSITIVE_KEY, plus a few infra-specific names.
const SENSITIVE_KEY =
  /(secret|token|password|passwd|pwd|credential|private[_-]?key|api[_-]?key|access[_-]?key|secret[_-]?key|client[_-]?secret|service[_-]?role|bearer|auth[_-]?token|signing|webhook[_-]?secret|vault[_-]?master|master[_-]?key|connection[_-]?string|database[_-]?url|db[_-]?url|dsn|passphrase|session[_-]?key)/i

// Key names that look sensitive by the regex above but are SAFE to keep — these
// are counts/flags/metadata, not the secret itself. Prevents masking useful
// audit signal like "tokenCount" or "secretsConfigured: 4".
const SENSITIVE_KEY_ALLOWLIST =
  /(count|total|configured|present|missing|enabled|disabled|expires?|rotated|created|updated|length|status|name$|label|type$)/i

// VALUE patterns: real credential shapes. Scrubbed wherever they appear — even
// inside an otherwise-safe field (URL userinfo, a log line, an error message).
// Each is a global regex so every occurrence in a string is replaced.
const VALUE_PATTERNS: RegExp[] = [
  /github_pat_[A-Za-z0-9_]{20,}/g,             // GitHub fine-grained PAT
  /gh[pousr]_[A-Za-z0-9]{20,}/g,               // GitHub classic tokens (ghp_/gho_/ghu_/ghs_/ghr_)
  /sk_(?:live|test)_[A-Za-z0-9]{16,}/g,        // Stripe secret key
  /rk_(?:live|test)_[A-Za-z0-9]{16,}/g,        // Stripe restricted key
  /pk_(?:live|test)_[A-Za-z0-9]{16,}/g,        // Stripe publishable (public, but masked to be conservative)
  /whsec_[A-Za-z0-9]{16,}/g,                   // Stripe webhook signing secret
  /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWT (Supabase anon/service_role)
  /\bAKIA[0-9A-Z]{16}\b/g,                      // AWS access key id
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,             // Slack tokens
  /\b[a-f0-9]{64}\b/g,                          // 64-hex → VAULT_MASTER_KEY / sha256 (NOT 40-hex git SHAs)
]

// Connection-string / URL userinfo password: scheme://user:PASSWORD@host
// Keep scheme + user + host; mask only the password segment.
const URL_USERINFO = /([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)([^@\s]+)(@)/gi

// Bearer header value: keep the word "Bearer", mask the token.
const BEARER = /(Bearer\s+)([A-Za-z0-9._\-]{8,})/gi

// Allow-list of known-safe, non-secret identifier prefixes so the aggressive
// entropy catch never nukes useful audit IDs (Stripe objects, etc.).
const SAFE_ID_PREFIX =
  /^(price_|prod_|cus_|sub_|in_|txn_|pi_|ch_|re_|evt_|we_|seti_|sk_test_dummy|dpmnt_|prj_|team_|org_|user_|usr_)/

// High-entropy raw-key shape: long, mixed alphabet, no spaces/punctuation breaks.
const HIGH_ENTROPY = /^[A-Za-z0-9+/_=-]{40,}$/

// ─────────────────────────────────────────────────────────────────────────────
// 3. Primitive maskers
// ─────────────────────────────────────────────────────────────────────────────

function isSensitiveKey(key: string): boolean {
  if (!key) return false
  if (SENSITIVE_KEY_ALLOWLIST.test(key)) return false
  return SENSITIVE_KEY.test(key)
}

function looksEmpty(v: unknown): boolean {
  return v == null || v === '' || (typeof v === 'string' && v.trim() === '')
}

/**
 * Scrub secret-shaped substrings out of a single string value. Returns the
 * cleaned string plus a count of how many distinct scrubs happened (so callers
 * can keep stats). Used on values that are NOT under a sensitive key — i.e. the
 * defence against secrets leaking via free text, URLs, and error messages.
 */
function scrubInline(input: string): { value: string; hits: number } {
  let out = input
  let hits = 0

  out = out.replace(URL_USERINFO, (_m, pre, _pw, post) => {
    hits++
    return `${pre}${MASK_PRESENT}${post}`
  })
  out = out.replace(BEARER, (_m, pre) => {
    hits++
    return `${pre}${MASK_PRESENT}`
  })
  for (const re of VALUE_PATTERNS) {
    out = out.replace(re, () => {
      hits++
      return MASK_PRESENT
    })
  }
  return { value: out, hits }
}

/** True when a standalone string is itself a raw key the named patterns missed. */
function looksLikeRawSecret(s: string, aggressive: boolean): boolean {
  if (!aggressive) return false
  if (SAFE_ID_PREFIX.test(s)) return false
  if (!HIGH_ENTROPY.test(s)) return false
  // Require a real mix (letters AND digits) to avoid masking long words/IDs.
  return /[A-Za-z]/.test(s) && /[0-9]/.test(s)
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Recursive sanitizer
// ─────────────────────────────────────────────────────────────────────────────

interface Ctx {
  stats: SanitizeStats
  seen: WeakSet<object>
  maxStringLength: number
  maxArrayItems: number
  maxDepth: number
  aggressiveEntropy: boolean
}

function sanitizeString(value: string, underSensitiveKey: boolean, ctx: Ctx): string {
  if (underSensitiveKey) {
    if (looksEmpty(value)) {
      ctx.stats.missing++
      return MASK_MISSING
    }
    ctx.stats.masked++
    return MASK_PRESENT
  }

  if (looksLikeRawSecret(value, ctx.aggressiveEntropy)) {
    ctx.stats.masked++
    return MASK_PRESENT
  }

  const { value: scrubbed, hits } = scrubInline(value)
  if (hits > 0) ctx.stats.inlineScrubs += hits

  if (scrubbed.length > ctx.maxStringLength) {
    ctx.stats.truncated++
    return scrubbed.slice(0, ctx.maxStringLength) + ` …${MASK_TRUNCATED}`
  }
  return scrubbed
}

function sanitizeValue(value: unknown, underSensitiveKey: boolean, depth: number, ctx: Ctx): unknown {
  // A sensitive key with a null/empty value is a config GAP worth surfacing.
  if (underSensitiveKey && looksEmpty(value)) {
    ctx.stats.missing++
    return MASK_MISSING
  }
  if (underSensitiveKey && (value == null || typeof value !== 'object')) {
    // Non-empty primitive under a sensitive key → blanket mask, no shape leak.
    ctx.stats.masked++
    return MASK_PRESENT
  }

  if (value == null) return value
  const t = typeof value

  if (t === 'string') return sanitizeString(value as string, underSensitiveKey, ctx)
  if (t === 'number' || t === 'boolean') return value
  if (t === 'bigint') return (value as bigint).toString()
  if (t === 'function' || t === 'symbol') return undefined

  if (depth >= ctx.maxDepth) {
    ctx.stats.guarded++
    return MASK_MAXDEPTH
  }

  // Non-plain objects (Date, etc.) → safe string form, then inline-scrubbed.
  if (value instanceof Date) return value.toISOString()

  if (Array.isArray(value)) {
    if (ctx.seen.has(value)) { ctx.stats.guarded++; return MASK_CIRCULAR }
    ctx.seen.add(value)
    const capped = value.length > ctx.maxArrayItems
    const slice = capped ? value.slice(0, ctx.maxArrayItems) : value
    const out = slice.map((item) => sanitizeValue(item, underSensitiveKey, depth + 1, ctx))
    if (capped) {
      ctx.stats.truncated++
      out.push(`… +${value.length - ctx.maxArrayItems} more ${MASK_TRUNCATED}`)
    }
    ctx.seen.delete(value)
    return out
  }

  if (t === 'object') {
    const obj = value as Record<string, unknown>
    if (ctx.seen.has(obj)) { ctx.stats.guarded++; return MASK_CIRCULAR }
    ctx.seen.add(obj)
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(obj)) {
      const childSensitive = isSensitiveKey(key)
      out[key] = sanitizeValue(obj[key], childSensitive, depth + 1, ctx)
    }
    ctx.seen.delete(obj)
    return out
  }

  // Unknown exotic type — drop it rather than risk leaking a stringified secret.
  ctx.stats.guarded++
  return undefined
}

/**
 * Sanitize a raw Hub snapshot. Pure: the input object is never mutated. Never
 * throws — a malformed input yields { ok:false, error } with empty data.
 */
export function sanitizeSnapshot(raw: RawIntegrationSnapshot, opts: ProcessOptions = {}): SanitizeResult {
  const stats: SanitizeStats = { masked: 0, missing: 0, inlineScrubs: 0, truncated: 0, guarded: 0 }
  try {
    if (raw == null || typeof raw !== 'object') {
      return { ok: false, data: {}, stats, error: 'Snapshot must be a non-null object.' }
    }
    const ctx: Ctx = {
      stats,
      seen: new WeakSet<object>(),
      maxStringLength: Math.max(80, opts.maxStringLength ?? 600),
      maxArrayItems: Math.max(1, opts.maxArrayItems ?? 50),
      maxDepth: Math.max(2, opts.maxDepth ?? 12),
      aggressiveEntropy: opts.aggressiveEntropy !== false,
    }
    const data = sanitizeValue(raw, false, 0, ctx)
    return { ok: true, data, stats }
  } catch (err: any) {
    return { ok: false, data: {}, stats, error: err?.message || 'Sanitization failed.' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Context formatter (sanitized object → token-lean prompt body)
// ─────────────────────────────────────────────────────────────────────────────

const INDENT = '  '

/** Compact, deterministic YAML-ish pretty-printer. Cheaper than JSON whitespace. */
function renderBlock(value: unknown, depth: number): string {
  const pad = INDENT.repeat(depth)
  if (value == null) return `${pad}null`
  const t = typeof value

  if (t !== 'object') return `${pad}${String(value)}`

  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}(empty)`
    return value
      .map((item) => {
        if (item != null && typeof item === 'object') {
          return `${pad}-\n${renderBlock(item, depth + 1)}`
        }
        return `${pad}- ${String(item)}`
      })
      .join('\n')
  }

  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj)
  if (keys.length === 0) return `${pad}(none)`
  return keys
    .map((k) => {
      const v = obj[k]
      if (v != null && typeof v === 'object') {
        return `${pad}${k}:\n${renderBlock(v, depth + 1)}`
      }
      return `${pad}${k}: ${String(v)}`
    })
    .join('\n')
}

const DEFAULT_INSTRUCTION = [
  'You are an infrastructure auditor. Using ONLY the sanitized provider snapshot',
  'below, produce a structured B2B Readiness Audit report with these sections:',
  '  1. Executive Summary (2–3 sentences, overall readiness verdict).',
  '  2. Provider Readiness — one row per provider: status, what is configured,',
  '     and any health/latency/mismatch signal present in the data.',
  '  3. Security & Secrets Posture — which credentials are configured vs missing.',
  '  4. Gaps & Risks — concrete issues the data reveals (missing keys, webhook',
  '     mismatches, errors, stale config).',
  '  5. Recommendations — prioritized, actionable next steps.',
].join('\n')

const SENTINEL_LEGEND = [
  'SENTINEL SEMANTICS (read carefully — do not misreport these):',
  `  ${MASK_PRESENT}  → a credential IS configured; its value was redacted before`,
  '                      reaching you. Treat as PRESENT / healthy, NOT missing.',
  `  ${MASK_MISSING}            → a sensitive field is empty/unset. Treat as a CONFIG GAP.`,
  `  ${MASK_TRUNCATED}          → value/array shortened for length; not a defect.`,
  `  ${MASK_CIRCULAR} / ${MASK_MAXDEPTH} → structural guards; ignore for the audit.`,
].join('\n')

/**
 * Build the orchestrator-ready system-prompt context from a sanitized object.
 * Pure + never throws.
 */
export function buildAuditContext(sanitized: unknown, stats: SanitizeStats, opts: ProcessOptions = {}): string {
  const instruction = (opts.instruction && opts.instruction.trim()) || DEFAULT_INSTRUCTION
  const body = renderBlock(sanitized, 0)
  const surface =
    `SECRETS SURFACE (sanitizer telemetry): ${stats.masked} configured secret(s) masked, ` +
    `${stats.missing} missing, ${stats.inlineScrubs} inline scrub(s).`

  return [
    instruction,
    '',
    SENTINEL_LEGEND,
    '',
    'RULES:',
    '  - The snapshot has already been stripped of all secret material. Never ask',
    '    for, infer, or attempt to reconstruct any redacted value.',
    '  - Base every claim strictly on the data shown. Do not invent providers,',
    '    metrics, or status not present below.',
    '',
    surface,
    '',
    '===== SANITIZED PROVIDER SNAPSHOT =====',
    body,
    '===== END SNAPSHOT =====',
  ].join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Orchestrator — the one function the Hub / audit route calls
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full pipeline: raw Hub snapshot → sanitize → LLM-ready system-prompt context.
 *
 * Usage (from the audit route, after the Hub aggregates live provider data):
 *
 *   const { ok, systemPrompt, stats, error } = processAuditSnapshot(rawSnapshot)
 *   if (!ok) return NextResponse.json({ ok: false, error }, { status: 422 })
 *   const report = await callAuditModel({ prompt: systemPrompt, ... })
 *
 * The returned systemPrompt is safe to hand to ChatGPT or Claude — it contains
 * no live credentials.
 */
export function processAuditSnapshot(raw: RawIntegrationSnapshot, opts: ProcessOptions = {}): ProcessResult {
  const empty: SanitizeStats = { masked: 0, missing: 0, inlineScrubs: 0, truncated: 0, guarded: 0 }
  const sane = sanitizeSnapshot(raw, opts)
  if (!sane.ok) {
    return { ok: false, systemPrompt: '', sanitized: {}, stats: sane.stats || empty, error: sane.error }
  }
  try {
    const systemPrompt = buildAuditContext(sane.data, sane.stats, opts)
    return { ok: true, systemPrompt, sanitized: sane.data, stats: sane.stats }
  } catch (err: any) {
    return { ok: false, systemPrompt: '', sanitized: sane.data, stats: sane.stats, error: err?.message || 'Context build failed.' }
  }
}
