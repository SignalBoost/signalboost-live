import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("review_responses")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("GET review_responses error:", error);
    return NextResponse.json(
      { error: "Failed to load review responses" },
      { status: 500 }
    );
  }

  return NextResponse.json({ reviews: data || [] });
}

export async function POST(req: Request) {
  const supabase = createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();

  const {
    platform,
    review_id,
    review_rating,
    review_text,
    ai_suggestion,
    final_reply,
  } = body;

  if (!review_text || !final_reply) {
    return NextResponse.json(
      { error: "Missing review_text or final_reply" },
      { status: 400 }
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY" },
      { status: 500 }
    );
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const analysis = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `
You analyze customer reviews and business replies.

Return a JSON object with:
- sentiment: "positive" | "negative" | "neutral"
- topic: short label like "delay", "staff", "price", "quality", "general"
- response_style: short label like "warm_apology", "firm_but_polite", "enthusiastic_thanks"
- preferred_tone: e.g. "warm", "calm", "direct", "formal"
- preferred_formality: "casual" | "neutral" | "formal"
- preferred_structure: e.g. "short_direct", "long_empathetic"
- example_phrases: array of notable phrases from the reply
`.trim(),
      },
      {
        role: "user",
        content: `
Review (rating: ${review_rating ?? "unknown"}):
${review_text}

AI suggestion:
${ai_suggestion || "(none)"}

Final reply sent by business:
${final_reply}
`.trim(),
      },
    ],
  });

  let parsed: any = {};

  try {
    parsed = JSON.parse(analysis.choices[0].message?.content || "{}");
  } catch (error) {
    console.error("Failed to parse review analysis JSON:", error);
  }

  const sentiment = parsed.sentiment || null;
  const topic = parsed.topic || null;
  const response_style = parsed.response_style || null;
  const preferred_tone = parsed.preferred_tone || null;
  const preferred_formality = parsed.preferred_formality || null;
  const preferred_structure = parsed.preferred_structure || null;
  const example_phrases = Array.isArray(parsed.example_phrases)
    ? parsed.example_phrases
    : [];

  const { data: saved, error: saveError } = await supabase
    .from("review_responses")
    .insert({
      user_id: user.id,
      platform: platform || null,
      review_id: review_id || null,
      review_rating: review_rating || null,
      review_text,
      ai_suggestion: ai_suggestion || null,
      final_reply,
      sentiment,
      topic,
      response_style,
    })
    .select("*")
    .single();

  if (saveError) {
    console.error("POST review_responses error:", saveError);
    return NextResponse.json(
      { error: "Failed to save review response" },
      { status: 500 }
    );
  }

  const situation_type = `${sentiment || "unknown"}_${topic || "general"}`;

  const { data: existingPatterns } = await supabase
    .from("review_response_patterns")
    .select("*")
    .eq("user_id", user.id)
    .eq("situation_type", situation_type)
    .maybeSingle();

  const mergedPhrases = Array.from(
    new Set([...(existingPatterns?.example_phrases || []), ...example_phrases])
  );

  const patternPayload = {
    user_id: user.id,
    situation_type,
    preferred_tone: preferred_tone || existingPatterns?.preferred_tone || null,
    preferred_formality:
      preferred_formality || existingPatterns?.preferred_formality || null,
    preferred_structure:
      preferred_structure || existingPatterns?.preferred_structure || null,
    example_phrases: mergedPhrases,
    last_updated_at: new Date().toISOString(),
  };

  if (existingPatterns) {
    await supabase
      .from("review_response_patterns")
      .update(patternPayload)
      .eq("id", existingPatterns.id);
  } else {
    await supabase.from("review_response_patterns").insert(patternPayload);
  }

  return NextResponse.json({
    review: saved,
    pattern: patternPayload,
  });
}
