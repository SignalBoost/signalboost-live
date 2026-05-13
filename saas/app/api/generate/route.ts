// saas/app/api/generate/route.ts

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createRouteHandlerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated." },
        { status: 401 }
      );
    }

    const { prompt, mode, language } = await req.json();

    if (!prompt || !mode) {
      return NextResponse.json(
        { error: "Missing prompt or mode." },
        { status: 400 }
      );
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });

    // Load brand profile memory
    const { data: brandProfile } = await supabase
      .from("brand_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    const brandContext = brandProfile
      ? `
You are speaking on behalf of a brand with these traits:
- Name: ${brandProfile.brand_name || "Unknown"}
- Tagline: ${brandProfile.brand_tagline || "N/A"}
- Tone: ${brandProfile.brand_tone || "neutral"}
- Formality: ${brandProfile.formality_level || "neutral"}
- Primary audience: ${brandProfile.primary_audience || "general"}
- Personality: ${brandProfile.brand_personality || "not specified"}
- Primary language: ${brandProfile.primary_language || language}
- Cultural notes: ${brandProfile.cultural_notes || "none"}
`
      : `
No specific brand profile is set. Use a friendly, clear, and trustworthy tone.
`;

    const messages = [
      {
        role: "system",
        content: `
You are SignalBoost AI.

Your job is to generate content that matches the brand's identity and audience.

${brandContext}

Mode: ${mode}
Respond in language: ${language}
`.trim(),
      },
      {
        role: "user",
        content: prompt,
      },
    ];

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.8,
    });

    const result = completion.choices[0].message?.content || "No response.";

    await supabase.from("generations").insert({
      user_id: user.id,
      prompt,
      result,
      mode,
      language,
    });

    await supabase.rpc("deduct_credits", {
      uid: user.id,
      used: 1,
    });

    return NextResponse.json({ result });
  } catch (error: any) {
    console.error("Generate API error:", error);
    return NextResponse.json(
      { error: "Generation failed." },
      { status: 500 }
    );
  }
}
