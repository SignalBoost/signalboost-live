// saas/app/api/voice/route.ts

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new NextResponse("Not authenticated", { status: 401 });
    }

    const { text, language } = await req.json();

    if (!text || text.trim().length === 0) {
      return new NextResponse("Missing text", { status: 400 });
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });

    // ⭐ Language → Voice mapping
    const voiceMap: Record<string, string> = {
      en: "alloy",
      es: "es-ES-Standard-A",
      pt: "pt-BR-Standard-A",
      pl: "pl-PL-Standard-A",
      ru: "ru-RU-Standard-A",
    };

    const selectedVoice = voiceMap[language] || "alloy";

    // ⭐ Generate speech
    const speech = await client.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: selectedVoice,
      input: text,
      format: "mp3",
    });

    const buffer = Buffer.from(await speech.arrayBuffer());

    // ⭐ Deduct 1 credit for voice generation
    await supabase.rpc("deduct_credits", {
      uid: user.id,
      used: 1,
    });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (error: any) {
    console.error("Voice API error:", error);
    return new NextResponse("Voice generation failed", { status: 500 });
  }
}
