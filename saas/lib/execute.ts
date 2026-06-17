// lib/infra-pr/execute.ts
// THE INTEGRATION SEAM.
// Replays the stored payload through your EXISTING Hub action engine at
// /api/hub/action, forwarding the owner's session cookie so the engine
// authorizes and runs exactly as if the template were executed by hand in
// the console. This reuses every executor you already wired (Vercel,
// Supabase, GitHub, Stripe, OpenAI, ...) — nothing is re-implemented here.
//
// If your engine route lives at a different path, change ENGINE_PATH below.
import type { InfraPr } from './store';

const ENGINE_PATH = '/api/hub/action';

export async function executeViaEngine(
  pr: InfraPr,
  origin: string,
  cookie: string,
): Promise<{ ok: boolean; data?: any; error?: string }> {
  try {
    const res = await fetch(`${origin}${ENGINE_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // forward the authenticated owner's session to the same-origin engine
        cookie,
      },
      body: JSON.stringify(pr.payload),
      cache: 'no-store',
    });

    let data: any = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    // Treat both HTTP errors and engine-level { ok:false } as failures.
    if (!res.ok || data?.ok === false) {
      return { ok: false, error: data?.error || `engine returned HTTP ${res.status}` };
    }

    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'engine call failed' };
  }
}
