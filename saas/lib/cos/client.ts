// saas/lib/cos/client.ts
// ─────────────────────────────────────────────────────────────────────────────
// Client-side handoff from the Concierge UI to the COS.
//
// Design law (from contracts.ts): THE REQUEST IS DUMB; THE SERVER DECIDES
// EVERYTHING. So this payload carries only the compiled spec (as the turn's user
// text) plus harmless hints — surface, conversation id, and an OPTIONAL preferred
// mode the router may ignore. It never carries the system prompt, the doctrine,
// the principal, or tool/engine choices: the server owns all of that.
// ─────────────────────────────────────────────────────────────────────────────

import type { IntentKind } from '@/lib/cos'
import { SPEC_OPEN, SPEC_CLOSE } from '@/lib/ai/promptCompiler'

/** The dumb request the browser sends to /api/cos/run. */
export interface CosRunRequest {
  /** The compiled spec — becomes the turn's latest user text on the server. */
  text: string
  /** The page the user is on. A hint for the router, not authority. */
  surface: string
  /** Continues an existing COS conversation, or null to start one. */
  conversationId: string | null
  /** Advisory only; the router MAY honor it, never must. */
  preferredMode?: IntentKind
}

/** Shape returned by /api/cos/run (mirrors CosReply, minus internals we don't surface). */
export interface CosRunResult {
  ok: boolean
  text: string
  timedOut: boolean
  error?: string
}

/**
 * Lift the fenced spec out of the Concierge's reply. Returns the inner spec text
 * (trimmed) or null if the reply contained no spec (i.e. it was plain chat, not
 * an execution request). The UI shows this to the user before "Run".
 */
export function extractCompiledSpec(conciergeReply: string): string | null {
  const start = conciergeReply.indexOf(SPEC_OPEN)
  const end = conciergeReply.indexOf(SPEC_CLOSE)
  if (start === -1 || end === -1 || end <= start) return null
  const inner = conciergeReply.slice(start + SPEC_OPEN.length, end).trim()
  return inner.length > 0 ? inner : null
}

/** Build the dumb COS request from a compiled spec. Single place that shapes it. */
export function buildCosRunRequest(
  spec: string,
  opts: { surface: string; conversationId?: string | null; preferredMode?: IntentKind },
): CosRunRequest {
  return {
    text: spec.trim(),
    surface: opts.surface,
    conversationId: opts.conversationId ?? null,
    ...(opts.preferredMode ? { preferredMode: opts.preferredMode } : {}),
  }
}

/**
 * Called when the user clicks "Run". Sends the compiled spec to the COS gateway
 * route and returns its reply. Throws only on transport failure; an execution
 * error comes back as { ok: false, error }.
 */
export async function runCompiledSpec(
  spec: string,
  opts: { surface: string; conversationId?: string | null; preferredMode?: IntentKind },
): Promise<CosRunResult> {
  const body = buildCosRunRequest(spec, opts)
  const res = await fetch('/api/cos/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  // The route always returns JSON in the CosRunResult shape, even on 4xx/5xx.
  const data = (await res.json().catch(() => null)) as CosRunResult | null
  if (!data) return { ok: false, text: '', timedOut: false, error: `COS request failed (${res.status})` }
  return data
}
