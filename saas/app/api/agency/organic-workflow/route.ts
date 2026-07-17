// saas/app/api/agency/organic-workflow/route.ts
// -----------------------------------------------------------------------------
// BYOK Campaign Studio — AI-first with a guaranteed MANUAL FLOOR.
//
// Control flow is done and correct. You only slot your EXISTING logic into the
// 4 marked stubs below. Safe by default: with the stubs un-wired, the endpoint
// returns clean "manual" responses (HTTP 200) instead of ever throwing a 500.
//
// Response contract the client reads:
//   success  -> { ok:true,  manual:false, source, draft }
//   fallback -> { ok:false, manual:true,  mode, draft }   (still HTTP 200)
//   blocked  -> { ok:false, manual:false, error }         (429 / 4xx)
// `manual:true` = client opens the editable draft instead of showing an error.
// -----------------------------------------------------------------------------

import { NextResponse } from 'next/server';
import { runWithFallback, buildAttempts } from '@/lib/agency/fallback';

// If your current route sets these, keep them:
// export const runtime = 'nodejs';
// export const dynamic = 'force-dynamic';

/* ══ PLUG YOUR EXISTING LOGIC INTO THESE 4 STUBS ═══════════════════════════ */

// 1) Origin check + IP rate-limit (6 / 10min) you already have.
//    Return { ok:false, status, message } to reject.
async function guard(req: Request): Promise<{ ok: boolean; status?: number; message?: string }> {
  // TODO: paste your existing origin + rate-limit checks here.
  return { ok: true };
}

// 2) Resolve the logged-in user's saved BYOK keys (never store/log them).
//    Use your lib/agency/userProviderKeys resolver.
async function resolveUserKeys(req: Request): Promise<{ anthropic?: string; openai?: string }> {
  // TODO: return the user's decrypted keys, or {} if none.
  return {};
}

// 3) The real generation calls — your prompt + userProviders adapter / callModel.
//    Return the finished assets as text. THROW on provider/network error;
//    runWithFallback catches it and moves to the next provider, then to manual.
async function generateWithClaude(brief: any, key: string): Promise<string> {
  // TODO: your Claude generation. Return generated assets text.
  throw new Error('not_wired');
}
async function generateWithOpenAI(brief: any, key: string): Promise<string> {
  // TODO: your OpenAI generation. Return generated assets text.
  throw new Error('not_wired');
}

/* ══════════════════════════════════════════════════════════════════════════ */

export async function POST(req: Request) {
  // Guards first (unchanged behavior).
  const g = await guard(req);
  if (!g.ok) {
    return NextResponse.json(
      { ok: false, manual: false, error: g.message || 'blocked' },
      { status: g.status || 429 },
    );
  }

  let brief: any = {};
  try { brief = await req.json(); } catch { brief = {}; }

  const keys = await resolveUserKeys(req);

  // ── FLOOR 1: no usable key → skip AI, open the manual editor (same fields).
  if (!keys.anthropic && !keys.openai) {
    return NextResponse.json(
      { ok: false, manual: true, mode: 'no_key', draft: emptyDraft(brief) },
      { status: 200 },
    );
  }

  // ── FLOORS 2 & 3: try providers in order (Claude ↔ OpenAI); junk = failure.
  const attempts = buildAttempts({
    claude: keys.anthropic ? () => generateWithClaude(brief, keys.anthropic as string) : undefined,
    openai: keys.openai ? () => generateWithOpenAI(brief, keys.openai as string) : undefined,
    primary: 'claude', // flip to 'openai' to prefer OpenAI; the other stays as backup
  });

  const result = await runWithFallback(attempts);

  if (result.ok) {
    // SUCCESS. Return your assets in the SHAPE YOUR CLIENT ALREADY READS.
    // If your client expects a different key than `draft`, rename it here.
    return NextResponse.json(
      { ok: true, manual: false, source: result.source, draft: result.text },
      { status: 200 },
    );
  }

  // ── All AI paths failed or returned junk → editable draft, never a dead screen.
  return NextResponse.json(
    { ok: false, manual: true, mode: 'ai_failed', draft: emptyDraft(brief) },
    { status: 200 },
  );
}

// Editable scaffold the client opens when AI can't produce.
// Mirror your REAL asset fields so manual mode matches AI mode 1:1.
function emptyDraft(brief: any) {
  return {
    youtube: '',
    linkedin: '',
    pressRelease: '',
    brief: brief || {}, // carry the brief through so the manual form is prefilled
  };
}
