// app/api/infra-pr/[id]/route.ts — repointed to the shared pr-engine (System A).
//
// RBAC (added for productization):
//   • View one PR : owner, admin, operator
//   • Close a PR  : owner, admin   (state-changing — operator cannot dismiss)
// Resolved by the proven hub resolver (verified session → hub role).
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/permission-middleware';
import { getInfrastructurePR, closeInfrastructurePR } from '@/lib/hub/pr-engine';
import { redactPrForDisplay } from '@/lib/hub/pr-redact';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Allowed = ('owner' | 'admin' | 'operator')[];

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

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(req, ['owner', 'admin', 'operator']);
  if (!gate.ok) return gate.res;

  const { id } = await ctx.params;
  const pr = await getInfrastructurePR(id);
  if (!pr.ok) return NextResponse.json({ ok: false, error: pr.error }, { status: 404 });
  // Mask secrets in staged payloads before they reach the browser.
  return NextResponse.json({ ok: true, pr: redactPrForDisplay(pr.pr) });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(req, ['owner', 'admin']);
  if (!gate.ok) return gate.res;

  const { id } = await ctx.params;
  const closed = await closeInfrastructurePR({ id, approvedBy: (gate.user as any).id ?? null });
  if (!closed.ok) return NextResponse.json({ ok: false, error: closed.error }, { status: 500 });
  return NextResponse.json({ ok: true, pr: closed.pr });
}
