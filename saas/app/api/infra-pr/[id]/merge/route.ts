// app/api/infra-pr/[id]/merge/route.ts — approval gate, repointed to pr-engine.
// On merge, pr-engine runs each step in order through the live hub action engine,
// forwarding the owner's cookie so every call carries the owner's session and
// passes the existing permission + policy + audit checks. Nothing fires until here.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { mergeInfrastructurePR } from '@/lib/hub/pr-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
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
