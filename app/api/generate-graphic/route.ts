import { NextResponse } from "next/server";
import { createMarketingServerSupabase } from "@/lib/auth/supabaseServer";
import { readJsonLimited } from "@/lib/http/readJsonLimited";
import { rateLimited } from "@/lib/http/rateLimit";
import { logSanitizedError } from "@/lib/http/logError";
import { clientIpKey } from "@/lib/http/clientIp";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 50_000;
const MAX_PROMPT = 4000;
const RATE_MAX = 20;
const RATE_WINDOW_MS = 60_000;


export async function POST(req: Request) {
  try {
    // Pre-auth IP rate limit so unauthenticated floods can't repeatedly invoke
    // Supabase auth before the per-user limit (below) ever applies.
    if (await rateLimited(`graphic-ip:${clientIpKey(req)}`, { max: 60, windowMs: RATE_WINDOW_MS })) {
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

    if (await rateLimited(`graphic:${user.id}`, { max: RATE_MAX, windowMs: RATE_WINDOW_MS })) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429 }
      );
    }

    // Hardened read: exact JSON media type + a hard byte ceiling enforced while
    // the stream is consumed, so a missing/false Content-Length or chunked
    // encoding cannot smuggle an oversized body past the guard.
    const parsed = await readJsonLimited<{ prompt?: unknown }>(req, {
      maxBytes: MAX_BODY_BYTES,
    });
    if (!parsed.ok) {
      return NextResponse.json(
        { success: false, error: parsed.error },
        { status: parsed.status }
      );
    }

    const body = parsed.value;
    const prompt = body && typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      return NextResponse.json(
        { success: false, error: "A non-empty 'prompt' string is required" },
        { status: 400 }
      );
    }
    if (prompt.length > MAX_PROMPT) {
      return NextResponse.json(
        { success: false, error: `'prompt' must be at most ${MAX_PROMPT} characters` },
        { status: 400 }
      );
    }

    // NOTE: image generation is not yet wired to a provider. Returns a demo
    // asset, flagged mock:true so callers don't treat it as real output.
    return NextResponse.json({ success: true, mock: true, image_url: "/demo/sample.png" });
  } catch (err) {
    const ref = logSanitizedError("generate-graphic", err);
    return NextResponse.json(
      { success: false, error: "Internal server error", ref },
      { status: 500 }
    );
  }
}
