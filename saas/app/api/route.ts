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
  if (language === "pt") return "Write the entire response in Brazilian Portuguese.";
  if (language === "es") return "Write the entire response in Spanish.";
  if (language === "pl") return "Write the entire response in Polish.";
  if (language === "ru") return "Write the entire response in Russian.";
  return "Write the entire response in English.";
}

function buildPrompt(mode: string, prompt: string) {
  if (mode === "video") {
    return `
Create a NEW VIDEO PRODUCTION PLAN for this idea:

"${prompt}"

Do NOT talk about whether you can show real videos.
Do NOT mention YouTube.
Do NOT say you cannot provide videos or images.

The user wants a creative video plan, not existing footage.

Use this exact format:

# VIDEO TITLE

# FORMAT

# HOOK

# SCENE 1
Visual:
Voiceover:
On-screen text:
Sound effects:

# SCENE 2
Visual:
Voiceover:
On-screen text:
Sound effects:

# SCENE 3
Visual:
Voiceover:
On-screen text:
Sound effects:

# ENDING / CTA

If this is about sports, make it energetic, dramatic, and highlight-style.
`;
  }

  if (mode === "visual") {
    return `
Create a NEW VISUAL CREATIVE BRIEF for this idea:

"${prompt}"

Do NOT say you cannot show images.
Do NOT mention external websites.

Use this exact format:

# VISUAL CONCEPT

# MAIN SUBJECT

# BACKGROUND

# COLORS

# TEXT OVERLAY

# LAYOUT

# STYLE DIRECTION

# IMAGE GENERATION PROMPT
`;
  }

  if (mode === "voice") {
    return `
Create a spoken voice narration script for:

"${prompt}"

Write it like something meant to be heard aloud.
Use emotion, short sentences, pacing, and pauses.
`;
  }

  if (mode === "podcast") {
    return `
Create a podcast script for:

"${prompt}"

Include intro, host dialogue, segment flow, and closing.
`;
  }

  if (mode === "social") {
    return `
Create social media ad content for:

"${prompt}"

Include hooks, captions, CTAs, and short variations.
`;
  }

  if (mode === "translate") {
    return `
Translate and culturally adapt this:

"${prompt}"

Preserve meaning, tone, and emotional impact.
`;
  }

  return `
Create a practical business/startup strategy for:

"${prompt}"
`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const prompt = body.prompt;
    const mode = body.mode || "strategy";
    const language = body.language || "en";
    const user_id = body.user_id;

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required." });
    }

    if (!user_id) {
      return NextResponse.json({ error: "User ID missing." });
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
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: `
You are SignalBoost AI.

You are NOT a search assistant.
You are NOT a generic chatbot.
You are a production assistant that creates scripts, plans, briefs, and creative assets.

Critical rule:
If the user selects video mode, ALWAYS create a video production plan.
If the user selects visual mode, ALWAYS create a visual creative brief.
Never say you cannot show videos or images.

${getLanguageInstruction(language)}
`,
        },
        {
          role: "user",
          content: buildPrompt(mode, prompt),
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
