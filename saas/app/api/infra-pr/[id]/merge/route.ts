// app/api/infra-pr/[id]/merge/route.ts  — thin framework binding (approval gate)
// Resolves the user's RBAC role from the app layer and INJECTS it into the
// module (which stays auth-agnostic). Swap resolveRole() for your auth source.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { mergeInfraPr } from '@/lib/infra-pr/merge';

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

// ── ROLE INJECTION POINT ──
// The module is auth-agnostic; the host app decides the role. By default we
// read Supabase JWT claims (app_metadata.role / user_metadata.role). Point
// this at your own roles table/claim if different. Accepts: cto|admin|owner,
// lead_dev|developer, ai_operator|operator (normalized inside the module).
function resolveRole(user: any): string {
  return (
    user?.app_metadata?.role ||
    user?.user_metadata?.role ||
    user?.app_metadata?.claims_admin && 'admin' ||
    'NONE'
  );
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const origin = new URL(req.url).origin;
  const cookie = req.headers.get('cookie') || '';

  const out = await mergeInfraPr({
    id,
    userId: (user as any).id ?? null,
    role: resolveRole(user),
    origin,
    cookie,
  });
  if (!out.ok) return NextResponse.json(out, { status: 400 });
  return NextResponse.json(out);
}
