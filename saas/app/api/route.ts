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
  if (language === "pt") return "Responda somente em português natural do Brasil.";
  if (language === "es") return "Responde solamente en español natural.";
  if (language === "pl") return "Odpowiadaj wyłącznie naturalnym językiem polskim.";
  if (language === "ru") return "Отвечай только на естественном русском языке.";
  return "Respond only in natural English.";
}

function getModeInstruction(mode: string) {
  if (mode === "video") {
    return `
CRITICAL:
The user selected VIDEO MODE.

You must NOT say:
- "I cannot show videos"
- "I cannot show images"
- "search YouTube"
- "go to another platform"

You are NOT being asked to display an existing video.
You are being asked to CREATE A VIDEO SCRIPT / VIDEO PRODUCTION PLAN.

Return a production-ready video concept with:
1. Title
2. Hook
3. Scene-by-scene storyboard
4. Voiceover narration
5. On-screen text
6. Camera/visual direction
7. Music and sound effects
8. Suggested format
9. Closing CTA

If the user mentions a sports goal, player, match, or highlight, create a sports highlight video script.
`;
  }

  if (mode === "visual") {
    return `
CRITICAL:
The user selected VISUAL MODE.

You must NOT say:
- "I cannot show images"
- "search online"
- "go to another platform"

You are being asked to CREATE A VISUAL CREATIVE BRIEF.

Return:
1. Image concept
2. Main subject
3. Background
4. Colors
5. Text overlay
6. Layout
7. Style direction
8. Image-generation prompt
`;
  }

  if (mode === "voice") {
    return `
The user selected VOICE MODE.
Create a spoken script designed to be read aloud.
Use rhythm, emotion, short sentences, pauses, and natural narration.
`;
  }

  if (mode === "podcast") {
    return `
The user selected PODCAST MODE.
Create a conversational podcast script with host voice, intro, flow, and closing.
`;
  }

  if (mode === "social") {
    return `
The user selected SOCIAL AD MODE.
Create short, punchy, high-converting social media content.
`;
  }

  if (mode === "translate") {
    return `
The user selected TRANSLATE MODE.
Translate/adapt the content naturally while preserving emotion, culture, and meaning.
`;
  }

  return `
The user selected STRATEGY MODE.
Create a practical business or marketing strategy.
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

    const systemPrompt = `
You are SignalBoost AI, a professional creative production platform.

${getModeInstruction(mode)}

${getLanguageInstruction(language)}

Important behavior:
- Never answer like a generic chatbot.
- Never refuse just because you cannot display media.
- If video mode is selected, create a video script/production plan.
- If visual mode is selected, create a visual creative brief.
- If voice mode is selected, create spoken narration.
- Be specific, practical, and production-ready.

Current selected mode: ${mode}
Current selected language: ${language}
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
          content: `
User request:
${prompt}

Generate the correct output for the selected mode: ${mode}.
Do not redirect the user elsewhere.
`,
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
