// saas/app/api/generate/route.ts

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { user } } = await supabase.auth.getUser();

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

    // ⭐ Generate text
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are SignalBoost AI. Respond in ${language}. Mode: ${mode}.`
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.8,
    });

    const result = completion.choices[0].message?.content || "No response.";

    // ⭐ Save to history
    await supabase.from("generations").insert({
      user_id: user.id,
      prompt,
      result,
      mode,
      language,
    });

    // ⭐ Deduct 1 credit
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
