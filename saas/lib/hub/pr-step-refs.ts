// saas/lib/hub/pr-step-refs.ts
//
// Step-output references for multi-step infrastructure PRs.
//
// Problem this solves: a PR's steps run sequentially, but a later step often
// needs a value that only exists AFTER an earlier step ran — the classic case
// being Stripe "create product" → "create price for that product". At staging
// time that id does not exist yet, so the assistant writes a reference:
//
//     step 0: stripe.create_product  payload { name: "Pro" }
//     step 1: stripe.create_price    payload { product: "{{steps[0].id}}" }
//
// This module resolves those references at MERGE time, against the `data`
// object each earlier step actually returned.
//
// Design rules (all deliberate):
//  • References resolve against a step's returned `data` object. Step 0 of
//    stripe.create_product returns { id, name }, so `{{steps[0].id}}` is the id.
//  • Backward-only. A step may reference strictly EARLIER steps. Self and
//    forward references are rejected at staging time, not at merge time, so the
//    assistant can self-correct in the same turn.
//  • Fail loud, fail BEFORE the provider. An unresolvable reference fails its
//    step without issuing the provider call. A literal "{{steps[0].id}}" must
//    never reach Stripe/Vercel/Supabase.
//  • Whole-string references keep their type: "{{steps[0].id}}" yields the raw
//    value (string, number, boolean). Embedded references interpolate as text:
//    "Price for {{steps[0].name}}" yields a string. Objects and arrays cannot be
//    interpolated into a larger string — that is an error, not a "[object Object]".
//  • References are literal text inside the stored payload, so the PR the owner
//    reviews and the PR fingerprint are unchanged. Approval semantics are not
//    touched by this module.

const SENSITIVE = /(secret|token|password|key|api[_-]?key|client[_-]?secret|service[_-]?role)/i

/** Matches {{steps[N]}} plus an optional path: .field, .a.b, [0], .a[2].b */
const REF_PATTERN = String.raw`\{\{\s*steps\[(\d+)\]((?:\.[A-Za-z0-9_$]+|\[\d+\])*)\s*\}\}`
const REF_GLOBAL = new RegExp(REF_PATTERN, 'g')
const REF_EXACT = new RegExp(`^${REF_PATTERN}$`)

/** Catches near-miss syntax so a typo fails at staging with a real message. */
const LOOSE_REF = /\{\{[^}]*\}\}/g

export interface StepRefUse {
  /** The full reference text, e.g. "{{steps[0].id}}" */
  ref: string
  /** Zero-based index of the referenced step */
  stepIndex: number
  /** Path within that step's data, e.g. "id" or "a.b[0].c" ('' means whole data) */
  path: string
}

export interface ResolvedRef {
  ref: string
  /** Display-safe rendering of what the reference became (secrets masked). */
  value: string
}

export interface ResolveResult {
  ok: boolean
  payload?: Record<string, unknown>
  resolved?: ResolvedRef[]
  error?: string
}

// ── Reference discovery ─────────────────────────────────────────────────────

function collectFromString(text: string, out: StepRefUse[]): void {
  REF_GLOBAL.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = REF_GLOBAL.exec(text)) !== null) {
    out.push({
      ref: m[0],
      stepIndex: Number(m[1]),
      path: normalizePath(m[2] || ''),
    })
  }
}

/** Every step reference used anywhere inside a payload (deep). */
export function findStepRefs(value: unknown, out: StepRefUse[] = []): StepRefUse[] {
  if (typeof value === 'string') {
    collectFromString(value, out)
  } else if (Array.isArray(value)) {
    for (const item of value) findStepRefs(item, out)
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) findStepRefs(v, out)
  }
  return out
}

/** Braces that look like a reference but do not parse as one. */
function findMalformedRefs(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    LOOSE_REF.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = LOOSE_REF.exec(value)) !== null) {
      if (!new RegExp(`^${REF_PATTERN}$`).test(m[0])) out.push(m[0])
    }
  } else if (Array.isArray(value)) {
    for (const item of value) findMalformedRefs(item, out)
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) findMalformedRefs(v, out)
  }
  return out
}

/** ".a[0].b" → "a[0].b" ; "" stays "" (meaning: the whole data object) */
function normalizePath(raw: string): string {
  return raw.startsWith('.') ? raw.slice(1) : raw
}

/** "a[0].b" → ["a", "0", "b"] */
function splitPath(path: string): string[] {
  if (!path) return []
  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)
}

// ── Staging-time validation ─────────────────────────────────────────────────

/**
 * Verify every reference in an ordered step list is resolvable in principle:
 * well-formed, pointing at a real step, and pointing STRICTLY BACKWARD.
 * Returns null when the steps are valid, or a human error message.
 */
export function validateStepRefs(
  steps: Array<{ templateId: string; payload?: Record<string, unknown> }>,
): string | null {
  for (let i = 0; i < steps.length; i++) {
    const where = `Step ${i + 1} ("${steps[i].templateId}")`
    const payload = steps[i].payload || {}

    const malformed = findMalformedRefs(payload)
    if (malformed.length) {
      return `${where} has a malformed reference ${malformed[0]}. Use the exact form {{steps[N].field}} — for example {{steps[0].id}}.`
    }

    for (const use of findStepRefs(payload)) {
      if (use.stepIndex >= steps.length) {
        return `${where} references ${use.ref}, but this PR only has ${steps.length} step${steps.length === 1 ? '' : 's'}.`
      }
      if (use.stepIndex === i) {
        return `${where} references its own output (${use.ref}). A step cannot consume a value it has not produced yet.`
      }
      if (use.stepIndex > i) {
        return `${where} references ${use.ref}, which runs later. Steps execute in order, so a step may only use output from an earlier step — reorder the steps.`
      }
    }
  }
  return null
}

// ── Merge-time resolution ───────────────────────────────────────────────────

function maskValue(key: string, value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (typeof value === 'string' && SENSITIVE.test(key)) {
    return value.length <= 8 ? '••••' : `${value.slice(0, 3)}••••${value.slice(-2)}`
  }
  return String(text).slice(0, 200)
}

function describeAvailable(data: unknown): string {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const keys = Object.keys(data as Record<string, unknown>)
    return keys.length ? `Available fields: ${keys.join(', ')}.` : 'That step returned no fields.'
  }
  if (data === undefined || data === null) return 'That step returned no data.'
  return `That step returned a ${Array.isArray(data) ? 'list' : typeof data}, not an object.`
}

interface Lookup {
  ok: boolean
  value?: unknown
  error?: string
}

function lookup(use: StepRefUse, outputs: unknown[]): Lookup {
  if (use.stepIndex >= outputs.length) {
    return { ok: false, error: `${use.ref} points at a step that has not run.` }
  }
  const root = outputs[use.stepIndex]
  const segments = splitPath(use.path)

  let cursor: unknown = root
  for (let s = 0; s < segments.length; s++) {
    if (cursor === null || cursor === undefined) {
      return {
        ok: false,
        error: `${use.ref} could not be resolved: step ${use.stepIndex + 1} returned nothing at "${segments.slice(0, s).join('.') || 'its result'}".`,
      }
    }
    if (typeof cursor !== 'object') {
      return {
        ok: false,
        error: `${use.ref} could not be resolved: "${segments.slice(0, s).join('.')}" is a ${typeof cursor}, so it has no "${segments[s]}".`,
      }
    }
    cursor = (cursor as Record<string, unknown>)[segments[s]]
  }

  if (cursor === undefined || cursor === null) {
    return {
      ok: false,
      error: `${use.ref} could not be resolved: step ${use.stepIndex + 1} did not return "${use.path || '(a value)'}". ${describeAvailable(root)}`,
    }
  }
  return { ok: true, value: cursor }
}

function resolveString(
  text: string,
  outputs: unknown[],
  key: string,
  resolved: ResolvedRef[],
): { ok: boolean; value?: unknown; error?: string } {
  const exact = REF_EXACT.exec(text)
  if (exact) {
    const use: StepRefUse = { ref: exact[0], stepIndex: Number(exact[1]), path: normalizePath(exact[2] || '') }
    const found = lookup(use, outputs)
    if (!found.ok) return { ok: false, error: found.error }
    resolved.push({ ref: use.ref, value: maskValue(key, found.value) })
    return { ok: true, value: found.value }
  }

  const uses = findStepRefs(text)
  if (uses.length === 0) return { ok: true, value: text }

  let output = text
  for (const use of uses) {
    const found = lookup(use, outputs)
    if (!found.ok) return { ok: false, error: found.error }
    if (found.value !== null && typeof found.value === 'object') {
      return {
        ok: false,
        error: `${use.ref} resolved to a ${Array.isArray(found.value) ? 'list' : 'object'} and cannot be placed inside the text "${text}". Reference a single field instead.`,
      }
    }
    output = output.split(use.ref).join(String(found.value))
    resolved.push({ ref: use.ref, value: maskValue(key, found.value) })
  }
  return { ok: true, value: output }
}

function walk(
  value: unknown,
  outputs: unknown[],
  key: string,
  resolved: ResolvedRef[],
): { ok: boolean; value?: unknown; error?: string } {
  if (typeof value === 'string') return resolveString(value, outputs, key, resolved)

  if (Array.isArray(value)) {
    const list: unknown[] = []
    for (const item of value) {
      const r = walk(item, outputs, key, resolved)
      if (!r.ok) return r
      list.push(r.value)
    }
    return { ok: true, value: list }
  }

  if (value && typeof value === 'object') {
    const obj: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const r = walk(v, outputs, k, resolved)
      if (!r.ok) return r
      obj[k] = r.value
    }
    return { ok: true, value: obj }
  }

  return { ok: true, value }
}

/**
 * Replace every {{steps[N].path}} in `payload` with the matching value from
 * `outputs` (index-aligned to the steps that already ran, each entry being that
 * step's returned `data`). Returns a NEW payload; the stored PR is untouched.
 */
export function resolveStepRefs(
  payload: Record<string, unknown>,
  outputs: unknown[],
): ResolveResult {
  const resolved: ResolvedRef[] = []
  const result = walk(payload || {}, outputs, '', resolved)
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, payload: (result.value as Record<string, unknown>) || {}, resolved }
}

/** True when a payload contains at least one step reference. */
export function hasStepRefs(payload: unknown): boolean {
  return findStepRefs(payload).length > 0
}
