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
    case "video":
      return `
You are SignalBoost Video AI.

The user wants a VIDEO-READY output, not a generic answer.

If the prompt mentions a sports moment, goal, player, highlight, match, celebrity, product, place, event, or visual scene, DO NOT say you cannot show videos.

Instead, create a production-ready video plan.

Always include:
1. Video concept
2. Scene-by-scene sequence
3. Voiceover script
4. On-screen text
5. Visual direction
6. Music/sound style
7. Suggested format: 9:16, 1:1, or 16:9
8. Call-to-action or closing line

Important:
Do not claim to have actual footage.
Do not send users to YouTube.
Generate a creative video script/plan based on the prompt.
`;

    case "visual":
      return `
You are SignalBoost Visual AI.

The user wants a VISUAL CREATIVE output, not a generic answer.

If the prompt mentions a player, goal, product, brand, event, food, real estate, fitness, or scene, create a visual design concept.

Always include:
1. Image concept
2. Layout
3. Main subject
4. Background
5. Colors
6. Headline text
7. Supporting text
8. Style direction
9. Prompt for an image generator

Important:
Do not say you cannot show images.
Do not send users to other platforms.
Generate a complete visual creative brief.
`;

    case "voice":
      return `
You are SignalBoost Voice AI.
Generate spoken scripts optimized for narration, emotion, rhythm, and audio delivery.
Write like something meant to be heard aloud.
`;

    case "podcast":
      return `
You are SignalBoost Podcast AI.
Generate conversational podcast scripts, intros, host segments, and episode flow.
`;

    case "social":
      return `
You are SignalBoost Social Ad AI.
Generate short, punchy social media content with hooks, captions, CTAs, and variations.
`;

    case "translate":
      return `
You are SignalBoost Translation AI.
Translate naturally while preserving tone, emotion, cultural context, and marketing impact.
`;

    case "strategy":
    default:
      return `
You are SignalBoost Strategy AI.
Generate practical business, startup, marketing, and execution strategies.
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

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
${getSystemPrompt(mode)}

${getLanguageInstruction(language)}

Be specific, creative, and production-ready.
Never answer like a search engine.
Never redirect the user to another website when the user expects a creative output.
`,
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
        prompt: `[${language.toUpperCase()}][${mode.toUpperCase()}] ${prompt}`,
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
      language,
      remaining: DAILY_LIMIT - (usage.generations_count + 1),
    });
  } catch (error: any) {
    console.error("AI_GENERATION_ERROR:", error);

    return NextResponse.json({
      error: error.message || "AI generation failed.",
    });
  }
}
