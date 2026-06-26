import { NextResponse } from "next/server";
import { createMarketingServerSupabase } from "@/lib/auth/supabaseServer";
import { readJsonLimited } from "@/lib/http/readJsonLimited";
import { rateLimited } from "@/lib/http/rateLimit";
import { logSanitizedError } from "@/lib/http/logError";
import { clientIpKey } from "@/lib/http/clientIp";
import { sameOriginOk } from "@/lib/http/sameOrigin";
import { normalizeTier } from "@/lib/video/subscription";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 50_000;
const MAX_TEXT = 5000;
const RATE_MAX = 20;
const RATE_WINDOW_MS = 60_000;
const REAL_VOICE_PROVIDER_ENABLED = process.env.VOICE_SYNTHESIS_PROVIDER_ENABLED === "true";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function subscriptionIsCurrentlyValid(row: Record<string, unknown>, now: number): boolean {
  const periodEnd = row.current_period_ends_at as string | null | undefined;
  if (!periodEnd) return false;
  const parsedEnd = Date.parse(periodEnd);
  return Number.isFinite(parsedEnd) && parsedEnd > now;
}

// Resolve the caller's plan tier from the AUTHORITATIVE subscription state — a
// `subscriptions` row in a currently-valid billing status — NOT the accounts
// plan/tier column, which can be stale or updated non-atomically with billing.
// Only `active` or `trialing` with a valid future current_period_ends_at unlock
// this cost-bearing feature. Missing period end, `past_due`, `cancelled`, an
// expired/absent trial, or no row at all resolve to least-privilege "free".
async function resolveActivePaidTier(
  supabase: Awaited<ReturnType<typeof createMarketingServerSupabase>>,
  userId: string,
): Promise<string> {
  if (!UUID_RE.test(userId)) return "free";
  try {
    const now = Date.now();
    const { data } = await supabase
      .from("subscriptions")
      .select("plan, status, current_period_ends_at, created_at")
      .eq("user_id", userId)
      .in("status", ["active", "trialing"])
      .gt("current_period_ends_at", new Date(now).toISOString())
      .order("current_period_ends_at", { ascending: false })
      .limit(1);

    const rows = Array.isArray(data) ? data as Record<string, unknown>[] : [];
    const valid = rows.find(row => subscriptionIsCurrentlyValid(row, now));
    if (!valid) return "free";
    return normalizeTier((valid.plan ?? null) as string | null | undefined);
  } catch {
    return "free";
  }
}

export async function POST(req: Request) {
  try {
    // Require an authenticated user. This route is cost-bearing once wired to a
    // synthesis provider, so it must never be publicly callable.
    // Pre-auth IP rate limit so unauthenticated floods can't repeatedly invoke
    // Supabase auth before the per-user limit (below) ever applies.
    if (await rateLimited(`voice-ip:${clientIpKey(req)}`, { max: 60, windowMs: RATE_WINDOW_MS })) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429 }
      );
    }

    // CSRF defense: reject cookie-authenticated POSTs that aren't same-origin
    // BEFORE auth or the per-user rate limit, so a cross-origin request (which
    // still carries the victim's cookies) can't burn the victim's voice quota
    // before being rejected. The IP pre-auth limit above still guards floods.
    if (!sameOriginOk(req)) {
      return NextResponse.json(
        { success: false, error: "Cross-origin request rejected" },
        { status: 403 }
      );
    }

    const supabase = await createMarketingServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (await rateLimited(`voice:${user.id}`, { max: RATE_MAX, windowMs: RATE_WINDOW_MS })) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429 }
      );
    }

    // Entitlement gate: voice synthesis is a paid feature. Fail CLOSED against
    // the authoritative subscription state — only an active/trialing subscription
    // with a valid future period end and an explicit paid tier may proceed.
    const PAID_TIERS = new Set(["launch", "growth", "command", "paid"]);
    const tier = await resolveActivePaidTier(supabase, user.id);
    if (!PAID_TIERS.has(tier)) {
      return NextResponse.json(
        { success: false, error: "Voice synthesis requires a paid plan" },
        { status: 402 }
      );
    }

    // Real synthesis must remain disabled until durable per-user quota accounting
    // exists and is recorded atomically with the entitlement check. This route can
    // only return the mock asset below; setting the provider flag early fails closed.
    if (REAL_VOICE_PROVIDER_ENABLED) {
      return NextResponse.json(
        { success: false, error: "Voice synthesis provider is disabled until durable quota accounting is implemented" },
        { status: 503 }
      );
    }

    // Hardened read: exact JSON media type + a hard byte ceiling enforced while
    // the stream is consumed, so a missing/false Content-Length or chunked
    // encoding cannot smuggle an oversized body past the guard.
    const parsed = await readJsonLimited<{ text?: unknown }>(req, {
      maxBytes: MAX_BODY_BYTES,
    });
    if (!parsed.ok) {
      return NextResponse.json(
        { success: false, error: parsed.error },
        { status: parsed.status }
      );
    }

    const body = parsed.value;
    const text = body && typeof body.text === "string" ? body.text.trim() : "";
    if (!text) {
      return NextResponse.json(
        { success: false, error: "A non-empty 'text' string is required" },
        { status: 400 }
      );
    }
    if (text.length > MAX_TEXT) {
      return NextResponse.json(
        { success: false, error: `'text' must be at most ${MAX_TEXT} characters` },
        { status: 400 }
      );
    }

    // NOTE: voice synthesis is not yet wired to a provider. Returns a demo
    // asset, flagged mock:true so callers don't treat it as real output.
    return NextResponse.json({ success: true, mock: true, audio_url: "/demo/sample.mp3" });
  } catch (err) {
    const ref = logSanitizedError("generate-voice", err);
    return NextResponse.json(
      { success: false, error: "Internal server error", ref },
      { status: 500 }
    );
  }
}
