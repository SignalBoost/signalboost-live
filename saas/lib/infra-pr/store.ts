// lib/infra-pr/store.ts
// CRUD + cryptographically-chained audit ledger. All DB access funnels
// through ./client. Signing uses Node's native crypto (zero deps).
import { createHmac } from 'crypto';
import { infraAdminClient } from './client';
import { InfraPr, InfraPrDraft, InfraPrStatus, Result, AuditRow, ChainVerification } from './types';

const TABLE = 'pending_infrastructure_prs';
const AUDIT = 'infrastructure_pr_audit';

// ── Canonical, stable-order JSON so re-verification is deterministic ────────
function sortKeys(v: any): any {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    return Object.keys(v)
      .sort()
      .reduce((acc: any, k) => {
        acc[k] = sortKeys(v[k]);
        return acc;
      }, {});
  }
  return v;
}
function canonical(v: any): string {
  return JSON.stringify(sortKeys(v));
}
function signContent(content: string): string {
  const secret = process.env.AUDIT_SECRET || '';
  return createHmac('sha256', secret).update(content).digest('hex');
}
// The exact tuple that gets signed for a ledger entry.
function ledgerContent(row: {
  pr_id: string | null;
  actor: string | null;
  event: string;
  detail: any;
  at: string;
  previous_signature: string | null;
}): string {
  return canonical({
    pr_id: row.pr_id,
    actor: row.actor,
    event: row.event,
    detail: row.detail ?? null,
    at: row.at,
    prev: row.previous_signature ?? null,
  });
}

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

  const { data, error } = await c.client.from(TABLE).insert(row).select('*').single();
  if (error) return { ok: false, error: error.message };

  await auditInfraPr(data.id, draft.created_by ?? null, 'drafted', {
    service: draft.service,
    action: draft.action,
    risk: row.risk,
  });
  return { ok: true, data: data as InfraPr };
}

export async function listInfraPrs(statuses?: InfraPrStatus[]): Promise<Result<InfraPr[]>> {
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

export async function updateInfraPr(id: string, patch: Partial<InfraPr>): Promise<Result<InfraPr>> {
  const c = infraAdminClient();
  if (!c.ok) return { ok: false, error: c.error };

  const { data, error } = await c.client.from(TABLE).update(patch).eq('id', id).select('*').single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as InfraPr };
}

export async function closeInfraPr(id: string, actor: string | null): Promise<Result<InfraPr>> {
  const updated = await updateInfraPr(id, { status: 'closed' });
  if (updated.ok) await auditInfraPr(id, actor, 'closed', null);
  return updated;
}

// ── Append a cryptographically-chained ledger entry ────────────────────────
export async function auditInfraPr(
  pr_id: string | null,
  actor: string | null,
  event: string,
  detail: any,
): Promise<void> {
  const c = infraAdminClient();
  if (!c.ok) return;

  // previous_signature = signature of the most recent ledger entry (global chain)
  const { data: prev } = await c.client
    .from(AUDIT)
    .select('signature')
    .order('created_at', { ascending: false })
    .limit(1);
  const previous_signature = prev && prev[0] ? prev[0].signature : null;

  const at = new Date().toISOString();
  const signature = signContent(
    ledgerContent({ pr_id, actor, event, detail, at, previous_signature }),
  );

  await c.client.from(AUDIT).insert({
    pr_id,
    actor,
    event,
    detail,
    created_at: at,
    signature,
    previous_signature,
  });
}

// ── Verify the entire ledger is intact and untampered ──────────────────────
export async function verifyChain(): Promise<ChainVerification> {
  const c = infraAdminClient();
  if (!c.ok) return { ok: false, count: 0, brokenAt: { index: -1, id: '', reason: c.error || 'no client' } };

  const { data, error } = await c.client
    .from(AUDIT)
    .select('*')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) return { ok: false, count: 0, brokenAt: { index: -1, id: '', reason: error.message } };

  const rows = (data || []) as AuditRow[];
  let prevSig: string | null = null;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    // 1) link integrity: this row must reference the prior row's signature
    if ((r.previous_signature ?? null) !== prevSig) {
      return { ok: false, count: rows.length, brokenAt: { index: i, id: r.id, reason: 'broken link to previous entry' } };
    }
    // 2) content integrity: recompute and compare
    const expected = signContent(
      ledgerContent({
        pr_id: r.pr_id,
        actor: r.actor,
        event: r.event,
        detail: r.detail,
        at: r.created_at,
        previous_signature: r.previous_signature ?? null,
      }),
    );
    if (expected !== r.signature) {
      return { ok: false, count: rows.length, brokenAt: { index: i, id: r.id, reason: 'signature mismatch (tampered or AUDIT_SECRET changed)' } };
    }
    prevSig = r.signature;
  }
  return { ok: true, count: rows.length };
}
