// app/api/infra-pr/[id]/route.ts — repointed to the shared pr-engine (System A).
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getInfrastructurePR, closeInfrastructurePR } from '@/lib/hub/pr-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    },
  );
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const pr = await getInfrastructurePR(id);
  if (!pr.ok) return NextResponse.json({ ok: false, error: pr.error }, { status: 404 });
  return NextResponse.json({ ok: true, pr: pr.pr });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const closed = await closeInfrastructurePR({ id, approvedBy: (user as any).id ?? null });
  if (!closed.ok) return NextResponse.json({ ok: false, error: closed.error }, { status: 500 });
  return NextResponse.json({ ok: true, pr: closed.pr });
}
