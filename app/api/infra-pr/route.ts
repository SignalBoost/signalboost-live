// app/api/infra-pr/route.ts — repointed to the shared pr-engine (System A).
// The Chief of Staff stages PRs into the same `infrastructure_prs` table this
// reads from, so AI-drafted changes appear here for approval.
//
// RBAC (added for productization): the PR Cockpit is an infrastructure-control
// surface, so it is gated at the route layer — not merely "authenticated".
//   • View / list PRs : owner, admin, operator
//   • Stage a PR      : owner, admin, operator
// Authentication + role are resolved by the proven hub resolver
// (getCurrentUser → verified Supabase session → hub_workspace_users role),
// the same one /api/hub/action uses. No header-trust, no owner fallback.
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/permission-middleware';
import { listInfrastructurePRs, stageInfrastructurePR } from '@/lib/hub/pr-engine';
import { redactPrsForDisplay } from '@/lib/hub/pr-redact';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Allowed = ('owner' | 'admin' | 'operator')[];

// Resolve the verified hub user and check role. Returns the user on success or
// a ready-to-return NextResponse on failure (401 unauthenticated / 403 role).
async function requireRole(req: Request, allowed: Allowed) {
  const user = await getCurrentUser(req as any);
  if (!user) {
    return { ok: false as const, res: NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!allowed.includes(user.role as any)) {
    return { ok: false as const, res: NextResponse.json({ ok: false, error: 'Forbidden — insufficient role' }, { status: 403 }) };
  }
  return { ok: true as const, user };
}

export async function GET(req: Request) {
  const gate = await requireRole(req, ['owner', 'admin', 'operator']);
  if (!gate.ok) return gate.res;

  const list = await listInfrastructurePRs(undefined, 50);
  if (!list.ok) return NextResponse.json({ ok: false, error: list.error }, { status: 500 });
  // Mask secrets in staged payloads before they reach the browser.
  return NextResponse.json({ ok: true, prs: redactPrsForDisplay(list.prs) });
}

export async function POST(req: Request) {
  const gate = await requireRole(req, ['owner', 'admin', 'operator']);
  if (!gate.ok) return gate.res;
  const user = gate.user;

  const body = await req.json().catch(() => null);
  if (!body || !body.title || !Array.isArray(body.steps) || body.steps.length === 0) {
    return NextResponse.json({ ok: false, error: 'title and at least one step are required' }, { status: 400 });
  }

  const created = await stageInfrastructurePR({
    title: String(body.title),
    summary: String(body.summary || ''),
    risk: body.risk,
    steps: body.steps,
    createdBy: (user as any).id ?? null,
    createdByEmail: (user as any).email ?? null,
  });

  if (!created.ok) return NextResponse.json({ ok: false, error: created.error }, { status: 500 });
  return NextResponse.json({ ok: true, pr: created.pr });
}
