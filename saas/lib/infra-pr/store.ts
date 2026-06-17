// lib/infra-pr/store.ts
// CRUD + audit for the infrastructure PR queue. Flat { ok, error } style.
import { infraAdminClient } from './client';

export type InfraPrStatus = 'open' | 'merging' | 'merged' | 'failed' | 'closed';
export type InfraRisk = 'low' | 'medium' | 'high';

export interface InfraPrDraft {
  title: string;
  description?: string | null;
  service: string;
  action: string;
  payload: any;
  diff?: any;
  risk?: InfraRisk;
  triggers_redeploy?: boolean;
  source?: 'assistant' | 'manual';
  created_by?: string | null;
}

export interface InfraPr extends Required<Pick<InfraPrDraft, 'title' | 'service' | 'action'>> {
  id: string;
  description: string | null;
  payload: any;
  diff: any;
  risk: InfraRisk;
  triggers_redeploy: boolean;
  source: 'assistant' | 'manual';
  status: InfraPrStatus;
  result: any;
  error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  merged_by: string | null;
}

type Result<T> = { ok: boolean; data?: T; error?: string };

const TABLE = 'pending_infrastructure_prs';
const AUDIT = 'infrastructure_pr_audit';

export async function createInfraPr(draft: InfraPrDraft): Promise<Result<InfraPr>> {
  const c = infraAdminClient();
  if (!c.ok) return { ok: false, error: c.error };

  const row = {
    title: draft.title,
    description: draft.description ?? null,
    service: draft.service,
    action: draft.action,
    payload: draft.payload ?? {},
    diff: draft.diff ?? null,
    risk: draft.risk ?? 'medium',
    triggers_redeploy: !!draft.triggers_redeploy,
    source: draft.source ?? 'manual',
    created_by: draft.created_by ?? null,
    status: 'open' as InfraPrStatus,
  };

  const { data, error } = await c.client
    .from(TABLE)
    .insert(row)
    .select('*')
    .single();

  if (error) return { ok: false, error: error.message };

  await auditInfraPr(data.id, draft.created_by ?? null, 'drafted', {
    service: draft.service,
    action: draft.action,
    risk: row.risk,
  });

  return { ok: true, data: data as InfraPr };
}

export async function listInfraPrs(
  statuses?: InfraPrStatus[],
): Promise<Result<InfraPr[]>> {
  const c = infraAdminClient();
  if (!c.ok) return { ok: false, error: c.error };

  let q = c.client.from(TABLE).select('*').order('created_at', { ascending: false });
  if (statuses && statuses.length) q = q.in('status', statuses);

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data || []) as InfraPr[] };
}

export async function getInfraPr(id: string): Promise<Result<InfraPr>> {
  const c = infraAdminClient();
  if (!c.ok) return { ok: false, error: c.error };

  const { data, error } = await c.client.from(TABLE).select('*').eq('id', id).single();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'PR not found' };
  return { ok: true, data: data as InfraPr };
}

export async function updateInfraPr(
  id: string,
  patch: Partial<InfraPr>,
): Promise<Result<InfraPr>> {
  const c = infraAdminClient();
  if (!c.ok) return { ok: false, error: c.error };

  const { data, error } = await c.client
    .from(TABLE)
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as InfraPr };
}

export async function closeInfraPr(
  id: string,
  actor: string | null,
): Promise<Result<InfraPr>> {
  const updated = await updateInfraPr(id, { status: 'closed' });
  if (updated.ok) await auditInfraPr(id, actor, 'closed', null);
  return updated;
}

export async function auditInfraPr(
  pr_id: string,
  actor: string | null,
  event: string,
  detail: any,
): Promise<void> {
  const c = infraAdminClient();
  if (!c.ok) return;
  await c.client.from(AUDIT).insert({ pr_id, actor, event, detail });
}
