// app/api/infra-pr/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createInfraPr, listInfraPrs } from '@/lib/infra-pr/store';

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
        setAll() {
          /* read-only in route handler */
        },
      },
    },
  );
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const list = await listInfraPrs(['open', 'merging', 'merged', 'failed', 'closed']);
  if (!list.ok) return NextResponse.json({ ok: false, error: list.error }, { status: 500 });
  return NextResponse.json({ ok: true, prs: list.data });
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || !body.title || !body.service || !body.action || body.payload === undefined) {
    return NextResponse.json(
      { ok: false, error: 'title, service, action and payload are required' },
      { status: 400 },
    );
  }

  const created = await createInfraPr({
    title: String(body.title),
    description: body.description ?? null,
    service: String(body.service),
    action: String(body.action),
    payload: body.payload,
    diff: body.diff ?? null,
    risk: body.risk,
    triggers_redeploy: !!body.triggers_redeploy,
    source: body.source === 'assistant' ? 'assistant' : 'manual',
    created_by: user.id ?? null,
  });

  if (!created.ok) return NextResponse.json({ ok: false, error: created.error }, { status: 500 });
  return NextResponse.json({ ok: true, pr: created.data });
}
