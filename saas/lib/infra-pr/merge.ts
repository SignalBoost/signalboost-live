// lib/infra-pr/merge.ts
// The merge / approve execution. Loads the PR, runs it through the live
// engine, optionally fires a production redeploy, records result + audit.
import { getInfraPr, updateInfraPr, auditInfraPr, InfraPr } from './store';
import { executeViaEngine } from './execute';
import { triggerProductionRedeploy } from './redeploy';

interface MergeOpts {
  id: string;
  userId: string | null;
  origin: string;
  cookie: string;
}

type MergeResult = { ok: boolean; data?: InfraPr; error?: string };

export async function mergeInfraPr(opts: MergeOpts): Promise<MergeResult> {
  const { id, userId, origin, cookie } = opts;

  const loaded = await getInfraPr(id);
  if (!loaded.ok) return loaded;
  const pr = loaded.data;

  if (pr.status === 'merged') return { ok: false, error: 'PR already merged' };
  if (pr.status === 'merging') return { ok: false, error: 'Merge already in progress' };
  if (pr.status === 'closed') return { ok: false, error: 'PR is closed' };

  // claim it
  await updateInfraPr(id, { status: 'merging' });

  // 1) fire the live provider action through the existing engine
  const exec = await executeViaEngine(pr, origin, cookie);
  if (!exec.ok) {
    await updateInfraPr(id, { status: 'failed', error: exec.error });
    await auditInfraPr(id, userId, 'failed', { error: exec.error });
    return { ok: false, error: exec.error };
  }

  // 2) optional production redeploy (env/config changes usually need this)
  let redeploy: any = null;
  if (pr.triggers_redeploy) {
    const rd = await triggerProductionRedeploy();
    redeploy = rd.ok ? { triggered: true, ...rd.data } : { triggered: false, error: rd.error };
    await auditInfraPr(id, userId, 'redeploy_triggered', redeploy);
  }

  // 3) finalize
  const merged = await updateInfraPr(id, {
    status: 'merged',
    result: { engine: exec.data, redeploy },
    error: null,
    merged_at: new Date().toISOString(),
    merged_by: userId,
  });

  if (!merged.ok) return merged;
  await auditInfraPr(id, userId, 'merged', { redeploy });
  return { ok: true, data: merged.data };
}
