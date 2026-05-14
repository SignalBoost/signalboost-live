import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { original, edited } = await req.json();

  if (!original || !edited) {
    return NextResponse.json({ error: "Missing original or edited text" }, { status: 400 });
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  const analysis = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
You analyze how a user edits AI-generated text.
Extract the following:
- tone_shift (e.g. "more warm", "more formal", "more energetic")
- formality_shift (e.g. "less formal", "more casual")
- vocabulary_changes (list of words replaced or preferred)
- structure_shift (e.g. "shorter sentences", "more direct", "more descriptive")
`.trim(),
      },
      {
        role: "user",
        content: `
Original:
${original}

User Edit:
${edited}
`.trim(),
      },
    ],
    temperature: 0.2,
  });

  const parsed = JSON.parse(analysis.choices[0].message?.content || "{}");

  await supabase.from("behavioral_memory").insert({
    user_id: user.id,
    original_text: original,
    user_edit: edited,
    tone_shift: parsed.tone_shift || null,
    formality_shift: parsed.formality_shift || null,
    vocabulary_changes: parsed.vocabulary_changes || [],
    structure_shift: parsed.structure_shift || null,
  });

  return NextResponse.json({ success: true });
}
