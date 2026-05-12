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
  if (language === "pt") {
    return "Responda somente em português natural do Brasil.";
  }

  if (language === "es") {
    return "Responde solamente en español natural.";
  }

  if (language === "pl") {
    return "Odpowiadaj wyłącznie naturalnym językiem polskim.";
  }

  if (language === "ru") {
    return "Отвечай только на естественном русском языке.";
  }

  return "Respond only in natural English.";
}

function getModeInstruction(mode: string) {
  if (mode === "video") {
    return `
VIDEO MODE ACTIVE.

You are a professional AI video production system.

You MUST ALWAYS generate a video production plan.

NEVER say:
- you cannot show videos
- you cannot show images
- search YouTube
- search online
- go to another platform

The user does NOT want existing footage.
The user wants a NEW video concept.

Your response MUST ALWAYS follow this exact structure:

# VIDEO TITLE

# FORMAT
(9:16, 16:9, etc.)

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

If the topic is sports:
- create an energetic sports highlight video
- include dramatic commentary
- include crowd atmosphere
- include cinematic pacing

Under NO circumstances should you refuse.
`;
  }

  if (mode === "visual") {
    return `
VISUAL MODE ACTIVE.

You are a professional visual creative system.

NEVER say:
- you cannot show images
- search online
- go to another platform

Always generate:
1. Visual concept
2. Main subject
3. Background
4. Colors
5. Headline
6. Layout
7. Design direction
8. AI image prompt
`;
  }

  if (mode === "voice") {
    return `
VOICE MODE ACTIVE.

Create spoken narration scripts.
Use emotion, pacing, pauses, and natural spoken language.
`;
  }

  if (mode === "podcast") {
    return `
PODCAST MODE ACTIVE.

Create conversational podcast dialogue and episode flow.
`;
  }

  if (mode === "social") {
    return `
SOCIAL MODE ACTIVE.

Create short high-converting social media content.
`;
  }

  if (mode === "translate") {
    return `
TRANSLATE MODE ACTIVE.

Translate naturally while preserving meaning and emotion.
`;
  }

  return `
STRATEGY MODE ACTIVE.

Create practical startup and business strategies.
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

    const systemPrompt = `
You are SignalBoost AI.

${getModeInstruction(mode)}

${getLanguageInstruction(language)}

IMPORTANT:
- Never behave like a generic chatbot.
- Never refuse because media cannot be displayed.
- Always generate production-ready outputs.
- Follow the required structure exactly.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: systemPrompt,
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
        prompt: `[${language.toUpperCase()}][${mode.toUpperCase()}] ${prompt}`,
        result,
      },
    ]);

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
