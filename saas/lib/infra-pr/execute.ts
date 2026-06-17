// lib/infra-pr/execute.ts
// Two responsibilities:
//  1) executeViaEngine — live merge: replays the payload through the host
//     engine (default /api/hub/action) with the owner's cookie.
//  2) buildSimulationDiff — dry-run: WITHOUT touching any provider, predicts
//     the change as a structured diff (add/update/delete) for review.
//
// The dry-run is a *declarative* prediction derived from the action verb +
// payload shape (a true provider plan needs provider-side dry-run support);
// it is provider-aware for the 4 core toolkits and falls back generically.
import type { InfraPr, SimDiff, SimChange, ActionVerb } from './types';
import { deriveVerb } from './action-policy';

const ENGINE_PATH = process.env.INFRA_PR_ENGINE_PATH || '/api/hub/action';

// ── Live execution seam ────────────────────────────────────────────────────
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

// ── Dry-run simulation ──────────────────────────────────────────────────────
const SENSITIVE = /(secret|token|password|key|api[_-]?key|client[_-]?secret|service[_-]?role)/i;
function mask(key: string, value: any): any {
  if (typeof value === 'string' && SENSITIVE.test(key)) {
    return value.length <= 8 ? '••••' : `${value.slice(0, 3)}••••${value.slice(-2)}`;
  }
  return value;
}

// Best-effort identifier for what a delete/update targets, per provider/action.
function primaryTarget(provider: string, actionId: string, payload: Record<string, any>): string {
  const p = payload || {};
  const pick = (...keys: string[]) => {
    for (const k of keys) if (p[k] !== undefined && p[k] !== null) return String(p[k]);
    return '';
  };
  const a = (actionId || '').toLowerCase();
  if (a.includes('env')) return pick('key', 'name') || 'env var';
  if (a.includes('branch')) return pick('branch', 'ref', 'name') || 'branch';
  if (a.includes('product')) return pick('name', 'id', 'product') || 'product';
  if (a.includes('user')) return pick('email', 'id', 'user') || 'user';
  if (a.includes('bucket')) return pick('bucket', 'name') || 'bucket';
  if (a.includes('row') || a.includes('table')) return pick('table', 'id') || 'row';
  if (a.includes('domain')) return pick('domain', 'name') || 'domain';
  return pick('id', 'name', 'key', 'slug') || (provider || 'resource');
}

export function buildSimulationDiff(
  provider: string,
  actionId: string,
  payload: Record<string, any>,
  verbIn?: ActionVerb,
): SimDiff {
  const verb = verbIn || deriveVerb(actionId);
  const p = payload && typeof payload === 'object' ? payload : {};
  const changes: SimChange[] = [];

  if (verb === 'read') {
    changes.push({ op: 'noop', target: primaryTarget(provider, actionId, p) });
  } else if (verb === 'delete') {
    changes.push({ op: 'delete', target: primaryTarget(provider, actionId, p), before: '(exists)', after: null });
  } else {
    const op: SimChange['op'] = verb === 'create' ? 'add' : 'update';
    const keys = Object.keys(p);
    if (keys.length === 0) {
      changes.push({ op, target: primaryTarget(provider, actionId, p) });
    } else {
      for (const k of keys) {
        changes.push({
          op,
          target: k,
          before: op === 'update' ? '(current)' : undefined,
          after: mask(k, p[k]),
        });
      }
    }
  }

  const verbWord = verb === 'read' ? 'read' : verb === 'delete' ? 'delete' : verb === 'create' ? 'create' : 'update';
  return {
    simulated: true,
    provider,
    actionId,
    verb,
    summary: `Will ${verbWord} ${changes.length} item(s) on ${provider} via "${actionId}".`,
    changes,
  };
}
