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


const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Resolve the caller's plan tier server-side (least-privilege on failure). Voice
// synthesis is a paid feature, so free/demo are blocked below.
async function resolveUserTier(
  supabase: Awaited<ReturnType<typeof createMarketingServerSupabase>>,
  userId: string,
): Promise<string> {
  if (!UUID_RE.test(userId)) return "free";
  try {
    const { data } = await supabase
      .from("accounts")
      .select("plan, tier")
      .or(`user_id.eq.${userId},owner_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = (data ?? {}) as Record<string, unknown>;
    return normalizeTier((row.plan ?? row.tier) as string | null | undefined);
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

    // CSRF defense: reject cookie-authenticated POSTs that aren't same-origin.
    if (!sameOriginOk(req)) {
      return NextResponse.json(
        { success: false, error: "Cross-origin request rejected" },
        { status: 403 }
      );
    }

    // Entitlement gate: voice synthesis is a paid feature. Block free/demo now
    // so the gate is enforced before a cost-bearing provider is wired. When that
    // provider is connected, record per-render credit/quota usage atomically and
    // fail closed if quota/entitlement is missing.
    const tier = await resolveUserTier(supabase, user.id);
    if (tier === "free" || tier === "demo") {
      return NextResponse.json(
        { success: false, error: "Voice synthesis requires a paid plan" },
        { status: 402 }
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
