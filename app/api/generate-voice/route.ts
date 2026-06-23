import { NextResponse } from "next/server";
import { createMarketingServerSupabase } from "@/lib/auth/supabaseServer";
import { readJsonLimited } from "@/lib/http/readJsonLimited";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 50_000;
const MAX_TEXT = 5000;
const RATE_MAX = 20;
const RATE_WINDOW_MS = 60_000;
const rateHits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (rateHits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  rateHits.set(key, recent);
  if (rateHits.size > 5000) {
    for (const [k, v] of rateHits) {
      if (v.every((t) => now - t >= RATE_WINDOW_MS)) rateHits.delete(k);
    }
  }
  return recent.length > RATE_MAX;
}

export async function POST(req: Request) {
  try {
    // Require an authenticated user. This route is cost-bearing once wired to a
    // synthesis provider, so it must never be publicly callable.
    const supabase = await createMarketingServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (rateLimited(`voice:${user.id}`)) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429 }
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
    console.error("generate-voice route error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
