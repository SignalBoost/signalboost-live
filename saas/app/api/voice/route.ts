import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";

type OpenAIVoice = "alloy" | "ash" | "coral" | "echo" | "fable" | "onyx" | "nova" | "sage" | "shimmer";

export async function POST(req: Request) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new NextResponse("Not authenticated", { status: 401 });
    }

    const { text, language } = await req.json();

    if (!text || text.trim().length === 0) {
      return new NextResponse("Missing text", { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return new NextResponse("Missing OPENAI_API_KEY", { status: 500 });
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const voiceMap: Record<string, OpenAIVoice> = {
      en: "alloy",
      es: "nova",
      pt: "coral",
      pl: "sage",
      ru: "onyx",
    };

    const selectedVoice = voiceMap[language] || "alloy";

    const speech = await client.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: selectedVoice,
      input: text,
      format: "mp3",
    });

    const buffer = Buffer.from(await speech.arrayBuffer());

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
  } catch (error) {
    console.error("Voice API error:", error);
    return new NextResponse("Voice generation failed", { status: 500 });
  }
}
