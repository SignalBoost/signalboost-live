// saas/app/api/tts/voices/route.ts
// GET /api/tts/voices?locale=pt
// Returns the curated voice list, optionally filtered by locale.
// Response shape: { voices: CuratedVoice[] }

import { NextRequest, NextResponse } from "next/server";
import { CURATED_VOICES, type VoiceLocale } from "@/lib/elevenlabs/voices";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const locale = url.searchParams.get("locale");

  if (!locale) {
    return NextResponse.json({ voices: CURATED_VOICES });
  }

  // Match either exact locale ("pt-BR") or language prefix ("pt").
  const prefix = locale.toLowerCase();
  const filtered = CURATED_VOICES.filter((v) => {
    const vl = v.locale.toLowerCase();
    return vl === prefix || vl.startsWith(`${prefix}-`);
  });

  return NextResponse.json({ voices: filtered });
}
