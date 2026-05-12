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

function getLanguageInstruction(language: string) {
  switch (language) {
    case "es":
      return "Respond entirely in natural Spanish.";

    case "pt":
      return "Respond entirely in natural Portuguese.";

    case "pl":
      return "Respond entirely in natural Polish.";

    case "ru":
      return "Respond entirely in natural Russian.";

    case "en":
    default:
      return "Respond entirely in natural English.";
  }
}

function getSystemPrompt(mode: string) {
  switch (mode) {
    case "voice":
      return `
You are SignalBoost Voice AI.
Generate spoken scripts optimized for narration.
Use emotional pacing, natural pauses, and spoken language.
`;

    case "video":
      return `
You are SignalBoost Video AI.
Generate cinematic video scripts with:
- scenes
- narration
- visual direction
- pacing
- emotional storytelling
`;

    case "podcast":
      return `
You are SignalBoost Podcast AI.
Generate conversational podcast dialogue and host narration.
`;

    case "social":
      return `
You are SignalBoost Social Ad AI.
Generate short high-converting social media marketing content.
`;

    case "visual":
      return `
You are SignalBoost Visual AI.
Generate visual creative direction including:
- layout
- colors
- image concept
- CTA
- design structure
`;

    case "translate":
      return `
You are SignalBoost Translation AI.
Translate naturally while preserving tone, emotion, and marketing impact.
`;

    case "strategy":
    default:
      return `
You are SignalBoost Strategy AI.
Generate business, startup, marketing, and execution strategies.
`;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const prompt = body.prompt;
    const mode = body.mode || "strategy";
    const language = body.language || "en";
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

    // DAILY LIMIT

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
        error: "Daily free limit reached.",
      });
    }

    // AI GENERATION

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
${getSystemPrompt(mode)}

${getLanguageInstruction(language)}

Adapt naturally for the target audience and region.
`,
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

    // SAVE

    await supabase.from("generations").insert([
      {
        user_id,
        prompt: `[${language.toUpperCase()}][${mode.toUpperCase()}] ${prompt}`,
        result,
      },
    ]);

    // UPDATE LIMITS

    await supabase
      .from("usage_limits")
      .update({
        generations_count:
          usage.generations_count + 1,
      })
      .eq("id", usage.id);

    return NextResponse.json({
      result,
      mode,
      language,
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
