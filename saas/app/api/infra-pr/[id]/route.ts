// app/api/infra-pr/[id]/route.ts
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getInfraPr, closeInfraPr } from '@/lib/infra-pr/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const pr = await getInfraPr(id);
  if (!pr.ok) return NextResponse.json({ ok: false, error: pr.error }, { status: 404 });
  return NextResponse.json({ ok: true, pr: pr.data });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const closed = await closeInfraPr(id, (user as any).id ?? null);
  if (!closed.ok) return NextResponse.json({ ok: false, error: closed.error }, { status: 500 });
  return NextResponse.json({ ok: true, pr: closed.data });
}
