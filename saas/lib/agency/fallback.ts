// saas/lib/agency/fallback.ts
// -----------------------------------------------------------------------------
// AI-FIRST with a guaranteed MANUAL FLOOR.
// The platform must never hard-depend on AI. This helper runs the AI attempts
// in order and, if every path fails or returns junk, signals the caller to open
// the manual editor instead of throwing an error.
//
// Fully decoupled: it knows nothing about your providers. The route wraps each
// provider call (Claude / OpenAI, using your existing userProviders adapters)
// as an "attempt" thunk and passes them in. Adding a provider later = one more
// thunk, no change here.
//
// Result shape is flat {ok, ...} to match the repo's tsconfig (strict:false).
// -----------------------------------------------------------------------------

export type Attempt = {
  source: string;               // e.g. 'ai:claude' | 'ai:openai'
  run: () => Promise<string>;   // performs the real provider call, returns text
};

export type FallbackResult = {
  ok: boolean;      // true = a usable AI draft was produced
  manual: boolean;  // true = caller must open the manual editor (AI floor hit)
  text?: string;    // the generated draft (present when ok)
  source?: string;  // which attempt produced it (present when ok)
  reason?: string;  // why AI didn't produce — for logs only, never shown raw to user
};

// Junk guard. Empty, too short, or error-shaped output is treated as "AI failed"
// so the user gets a manual/editable path instead of a broken result.
export function isUsable(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = String(text).trim();
  if (t.length < 40) return false;                       // too short to be a real draft
  if (/^(error|null|undefined|n\/a)$/i.test(t)) return false;
  return true;
}

// Run attempts in order. First usable output wins. If none are usable -> manual.
export async function runWithFallback(attempts: Attempt[]): Promise<FallbackResult> {
  let reason = 'no_ai_available';
  for (const a of attempts) {
    try {
      const text = await a.run();
      if (isUsable(text)) {
        return { ok: true, manual: false, text: String(text).trim(), source: a.source };
      }
      reason = 'unusable_output:' + a.source;
    } catch (e: any) {
      reason = 'error:' + a.source + ':' + (e && e.message ? e.message : 'unknown');
    }
  }
  return { ok: false, manual: true, reason: reason };
}

// Build the ordered attempt list from whichever keys the user actually has.
// Pass the thunks you already build in the route from your adapter layer.
// `primary` lets you prefer one provider; the other is the automatic backup.
export function buildAttempts(opts: {
  claude?: () => Promise<string>;
  openai?: () => Promise<string>;
  primary?: 'claude' | 'openai';
}): Attempt[] {
  const order: Array<'claude' | 'openai'> =
    opts.primary === 'openai' ? ['openai', 'claude'] : ['claude', 'openai'];

  const list: Attempt[] = [];
  for (const p of order) {
    if (p === 'claude' && opts.claude) list.push({ source: 'ai:claude', run: opts.claude });
    if (p === 'openai' && opts.openai) list.push({ source: 'ai:openai', run: opts.openai });
  }
  return list; // empty list => runWithFallback returns manual:true (Floor 1: no key)
}
