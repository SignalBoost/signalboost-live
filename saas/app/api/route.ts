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

const DAILY_LIMIT = 5;

function getSystemPrompt(mode: string) {
  switch (mode) {
    case "voice":
      return "You are SignalBoost Voice AI. Generate spoken scripts optimized for narration and audio.";

    case "video":
      return "You are SignalBoost Video AI. Generate cinematic video scripts with scenes and narration.";

    case "podcast":
      return "You are SignalBoost Podcast AI. Generate natural podcast dialogue and conversational audio.";

    case "social":
      return "You are SignalBoost Social Ad AI. Generate short high-converting marketing content.";

    case "strategy":
    default:
      return "You are SignalBoost Strategy AI. Generate startup and business strategies.";
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
        error: "Prompt is required.",
      });
    }

    if (!user_id) {
      return NextResponse.json({
        error: "User ID missing.",
      });
    }

    // CHECK DAILY USAGE

    const today = new Date().toISOString().split("T")[0];

    let { data: usage } = await supabase
      .from("usage_limits")
      .select("*")
      .eq("user_id", user_id)
      .eq("usage_date", today)
      .single();

    // CREATE NEW DAILY ROW

    if (!usage) {
      const { data: newUsage } = await supabase
        .from("usage_limits")
        .insert([
          {
            user_id,
            usage_date: today,
            generations_count: 0,
          },
        ])
        .select()
        .single();

      usage = newUsage;
    }

    // BLOCK USER IF LIMIT REACHED

    if (usage.generations_count >= DAILY_LIMIT) {
      return NextResponse.json({
        error:
          "Daily free limit reached. Upgrade coming soon.",
      });
    }

    // GENERATE AI

    const completion =
      await openai.chat.completions.create({
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
      completion.choices[0]?.message?.content ||
      "No response generated.";

    // SAVE GENERATION

    await supabase.from("generations").insert([
      {
        user_id,
        prompt: `[${mode.toUpperCase()}] ${prompt}`,
        result,
      },
    ]);

    // UPDATE USAGE COUNT

    await supabase
      .from("usage_limits")
      .update({
        generations_count:
          usage.generations_count + 1,
      })
      .eq("id", usage.id);

    return NextResponse.json({
      result,
      remaining:
        DAILY_LIMIT -
        (usage.generations_count + 1),
    });
  } catch (error: any) {
    console.error(error);

    return NextResponse.json({
      error:
        error.message || "AI generation failed.",
    });
  }
}
