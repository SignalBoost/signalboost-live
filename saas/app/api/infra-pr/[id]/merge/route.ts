// app/api/infra-pr/[id]/merge/route.ts
// THE APPROVAL GATE. A POST here = the owner's explicit authorization.
// It forwards the owner's session cookie so the engine runs the live
// provider action under their identity, then optionally redeploys.
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { mergeInfraPr } from '@/lib/infra-pr/merge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const origin = new URL(req.url).origin;
  const cookie = req.headers.get('cookie') || '';

  const out = await mergeInfraPr({
    id,
    userId: (user as any).id ?? null,
    origin,
    cookie,
  });

  if (!out.ok) return NextResponse.json(out, { status: 400 });
  return NextResponse.json(out);
}
