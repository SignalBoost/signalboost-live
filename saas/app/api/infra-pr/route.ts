// app/api/infra-pr/route.ts — repointed to the shared pr-engine (System A).
// The Chief of Staff stages PRs into the same `infrastructure_prs` table this
// reads from, so AI-drafted changes appear here for approval.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { listInfrastructurePRs, stageInfrastructurePR } from '@/lib/hub/pr-engine';
import { redactPrsForDisplay } from '@/lib/hub/pr-redact';

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

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const list = await listInfrastructurePRs(undefined, 50);
  if (!list.ok) return NextResponse.json({ ok: false, error: list.error }, { status: 500 });
  // Mask secrets in staged payloads before they reach the browser.
  return NextResponse.json({ ok: true, prs: redactPrsForDisplay(list.prs) });
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

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
