// app/api/infra-pr/[id]/merge/route.ts — approval gate, repointed to pr-engine.
// On merge, pr-engine runs each step in order through the live hub action engine,
// forwarding the owner's cookie so every call carries the owner's session and
// passes the existing permission + policy + audit checks. Nothing fires until here.
//
// RBAC (added for productization): merge is the moment infrastructure actually
// changes, so it is the most tightly gated surface.
//   • Merge low / medium risk PR : owner, admin
//   • Merge HIGH risk PR          : owner ONLY
// The risk is read from the stored PR before any state change, so an admin can
// never escalate a high-risk change. Resolved by the proven hub resolver.
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/permission-middleware';
import { getInfrastructurePR, mergeInfrastructurePR } from '@/lib/hub/pr-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req as any);
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const role = user.role as string;
  // Anyone below admin cannot merge at all.
  if (role !== 'owner' && role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Forbidden — merging requires owner or admin' }, { status: 403 });
  }

  const { id } = await ctx.params;

  // Read the PR first so we can enforce risk-tiered authorization BEFORE the
  // engine flips any state. A high-risk merge is owner-only.
  const current = await getInfrastructurePR(id);
  if (!current.ok || !current.pr) {
    return NextResponse.json({ ok: false, error: current.error || 'PR not found' }, { status: 404 });
  }
  if (current.pr.risk === 'high' && role !== 'owner') {
    return NextResponse.json(
      { ok: false, error: 'Forbidden — high-risk PRs can only be merged by the owner' },
      { status: 403 },
    );
  }

  const origin = new URL(req.url).origin;
  const cookie = req.headers.get('cookie') || '';

  const out = await mergeInfrastructurePR({
    id,
    approvedBy: (user as any).id ?? null,
    origin,
    cookie,
  });
  if (!out.ok) return NextResponse.json(out, { status: 400 });
  return NextResponse.json(out);
}
