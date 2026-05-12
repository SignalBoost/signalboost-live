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
      return `
You are SignalBoost Voice AI.
Generate spoken scripts optimized for audio narration.
Use natural spoken language, short sentences, emotional pacing, and clear pauses.
Do not write like an essay or business report.
`;

    case "video":
      return `
You are SignalBoost Video AI.
Generate a video script with:
- scene-by-scene structure
- narrator voiceover
- visual direction
- pacing
- emotional hook
- closing call-to-action
This creates scripts for video production, not an actual video file.
`;

    case "podcast":
      return `
You are SignalBoost Podcast AI.
Generate podcast intros, host scripts, episode outlines, and conversational segments.
Use natural spoken language.
`;

    case "social":
      return `
You are SignalBoost Social Ad AI.
Generate short, punchy social media ad content.
Include hooks, captions, CTAs, and variations.
`;

    case "visual":
      return `
You are SignalBoost Visual AI.
Generate visual creative direction.
Include:
- image concept
- layout
- colors
- headline
- visual elements
- CTA
This is for creating marketing graphics.
`;

    case "translate":
      return `
You are SignalBoost Translation AI.
Translate and adapt the user's content for a target audience.
Preserve meaning, tone, and marketing impact.
If no target language is specified, translate to Spanish by default.
Make the output natural for speech and business use.
`;

    case "strategy":
    default:
      return `
You are SignalBoost Strategy AI.
Generate startup, business, product, and marketing strategies.
Be practical, structured, and execution-focused.
`;
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

    const today = new Date().toISOString().split("T")[0];

    let { data: usage } = await supabase
      .from("usage_limits")
      .select("*")
      .eq("user_id", user_id)
      .eq("usage_date", today)
      .single();

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

    if (usage.generations_count >= DAILY_LIMIT) {
      return NextResponse.json({
        error: "Daily free limit reached. Upgrade coming soon.",
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
      completion.choices[0]?.message?.content ||
      "No response generated.";

    await supabase.from("generations").insert([
      {
        user_id,
        prompt: `[${mode.toUpperCase()}] ${prompt}`,
        result,
      },
    ]);

    await supabase
      .from("usage_limits")
      .update({
        generations_count: usage.generations_count + 1,
      })
      .eq("id", usage.id);

    return NextResponse.json({
      result,
      mode,
      remaining: DAILY_LIMIT - (usage.generations_count + 1),
    });
  } catch (error: any) {
    console.error("AI_GENERATION_ERROR:", error);

    return NextResponse.json({
      error: error.message || "AI generation failed.",
    });
  }
}
