// saas/app/api/voice/route.ts

import { NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: Request) {
  try {
    const { text, language } = await req.json();

    if (!text || text.trim().length === 0) {
      return new NextResponse("Missing text", { status: 400 });
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });

    // ⭐ Choose voice based on language
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
