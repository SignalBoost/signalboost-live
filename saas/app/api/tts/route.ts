// saas/app/api/tts/route.ts
// POST /api/tts
// Body: { text: string, voiceId: string }
// Returns: { audioUrl, cached, characters, remaining }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { generateSpeech } from "@/lib/elevenlabs/client";
import { isAllowedVoice, DEFAULT_MODEL_ID } from "@/lib/elevenlabs/voices";
import {
  HARD_PER_REQUEST_CHAR_LIMIT,
  getMonthlyLimit,
  type PlanId,
} from "@/lib/elevenlabs/limits";

const STORAGE_BUCKET = "tts-cache";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function POST(req: NextRequest) {
  // ----- 1. Parse and validate body -----
  let body: { text?: string; voiceId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  const voiceId = body.voiceId ?? "";

  if (!text) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }
  if (text.length > HARD_PER_REQUEST_CHAR_LIMIT) {
    return NextResponse.json(
      {
        error: `Text exceeds the per-request limit of ${HARD_PER_REQUEST_CHAR_LIMIT} characters`,
      },
      { status: 400 },
    );
  }
  if (!isAllowedVoice(voiceId)) {
    return NextResponse.json({ error: "Voice not allowed" }, { status: 400 });
  }

  // ----- 2. Authenticate user (Next 16: cookies() is async) -----
  const cookieStore = await cookies();
  const supabaseUser = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {}
