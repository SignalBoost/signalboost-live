import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function getSystemPrompt(mode: string) {
  switch (mode) {
    case "voice":
      return "You are SignalBoost Voice AI. Generate spoken scripts optimized for narration, pacing, emotion, pauses, and audio delivery. Avoid long paragraphs and write like something meant to be heard aloud.";

    case "video":
      return "You are SignalBoost Video AI. Generate video scripts with scenes, narration, visual direction, hooks, pacing, camera feel, and strong storytelling. Format it clearly for video production.";

    case "podcast":
      return "You are SignalBoost Podcast AI. Generate conversational podcast scripts, intros, host segments, discussion flow, and natural spoken language.";

    case "social":
      return "You are SignalBoost Social Ad AI. Generate short, punchy marketing copy for social ads, hooks, captions, CTAs, and platform-friendly content.";

    case "strategy":
    default:
      return "You are SignalBoost Strategy AI. Generate clear business strategies, product ideas, launch plans, marketing plans, and execution steps for startups and businesses.";
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const prompt = body.prompt;
    const mode = body.mode || "strategy";
    const user_id = body.user_id;

    if (!prompt) {
      return NextResponse.json({
        error: "Prompt is required",
      });
    }

    if (!user_id) {
      return NextResponse.json({
        error: "User ID is required",
      });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: getSystemPrompt(mode),
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const result =
      completion.choices[0]?.message?.content || "No response generated.";

    await supabase.from("generations").insert([
      {
        user_id,
        prompt: `[${mode.toUpperCase()}] ${prompt}`,
        result,
      },
    ]);

    return NextResponse.json({
      result,
      mode,
    });
  } catch (error: any) {
    console.error("AI_GENERATION_ERROR:", error);

    return NextResponse.json({
      error: error.message || "AI generation failed",
    });
  }
}
