// saas/lib/infra-pr/execute.ts
// THE INTEGRATION SEAM.
// Replays the stored payload through your EXISTING Hub action engine at
// /api/hub/action, forwarding the owner's session cookie so the engine
// authorizes and runs exactly as if the template were executed by hand.
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
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(pr.payload),
      cache: 'no-store',
    });

    let data: any = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    if (!res.ok || data?.ok === false) {
      return { ok: false, error: data?.error || `engine returned HTTP ${res.status}` };
    }
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'engine call failed' };
  }
}
