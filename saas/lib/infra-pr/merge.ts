// lib/infra-pr/merge.ts
// Merge / approve execution with RBAC enforcement at the gate. The host app
// injects the merging user's role; the module rejects merges below the
// required clearance for the action's risk tier.
import { getInfraPr, updateInfraPr, auditInfraPr } from './store';
import { executeViaEngine } from './execute';
import { triggerProductionRedeploy } from './redeploy';
import { canMerge } from './action-policy';
import { InfraPr } from './types';

interface MergeOpts {
  id: string;
  userId: string | null;
  role: string | null; // injected by host app (auth-agnostic)
  origin: string;
  cookie: string;
}

type MergeResult = { ok: boolean; data?: InfraPr; error?: string };

export async function mergeInfraPr(opts: MergeOpts): Promise<MergeResult> {
  const { id, userId, role, origin, cookie } = opts;

  const loaded = await getInfraPr(id);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const pr = loaded.data as InfraPr;

  if (pr.status === 'merged') return { ok: false, error: 'PR already merged' };
  if (pr.status === 'merging') return { ok: false, error: 'Merge already in progress' };
  if (pr.status === 'closed') return { ok: false, error: 'PR is closed' };

  // ── RBAC gate ──
  const gate = canMerge(role, pr.risk);
  if (!gate.ok) {
    await auditInfraPr(id, userId, 'rejected', { reason: gate.error, have: gate.have, required: gate.required });
    return { ok: false, error: gate.error };
  }

  await updateInfraPr(id, { status: 'merging' });
  await auditInfraPr(id, userId, 'approved', { role: gate.have, risk: pr.risk });

  const exec = await executeViaEngine(pr, origin, cookie);
  if (!exec.ok) {
    await updateInfraPr(id, { status: 'failed', error: exec.error });
    await auditInfraPr(id, userId, 'failed', { error: exec.error });
    return { ok: false, error: exec.error };
  }

  let redeploy: any = null;
  if (pr.triggers_redeploy) {
    const rd = await triggerProductionRedeploy();
    redeploy = rd.ok ? { triggered: true, ...rd.data } : { triggered: false, error: rd.error };
    await auditInfraPr(id, userId, 'redeploy_triggered', redeploy);
  }

  const merged = await updateInfraPr(id, {
    status: 'merged',
    result: { engine: exec.data, redeploy },
    error: null,
    merged_at: new Date().toISOString(),
    merged_by: userId,
  });
  if (!merged.ok) return { ok: false, error: merged.error };

  await auditInfraPr(id, userId, 'executed', { redeploy });
  return { ok: true, data: merged.data as InfraPr };
}
