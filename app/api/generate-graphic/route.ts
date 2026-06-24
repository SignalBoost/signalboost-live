import { NextResponse } from "next/server";
import { createMarketingServerSupabase } from "@/lib/auth/supabaseServer";
import { readJsonLimited } from "@/lib/http/readJsonLimited";
import { rateLimited } from "@/lib/http/rateLimit";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 50_000;
const MAX_PROMPT = 4000;
const RATE_MAX = 20;
const RATE_WINDOW_MS = 60_000;

// Log a bounded, sanitized error line with a random correlation ref — never the
// raw exception object, stack, request body, headers, or provider payload, any
// of which can carry tokens or other sensitive values.
function logSanitizedError(scope: string, err: unknown): string {
  const ref = `err_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const name = err instanceof Error ? err.name : typeof err;
  const message = err instanceof Error ? err.message : "non-error thrown";
  console.error(`[${scope}] ${ref} ${name}: ${String(message).slice(0, 300)}`);
  return ref;
}


export async function POST(req: Request) {
  try {
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
