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

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const prompt = body.prompt;
    const user_id = body.user_id;

    if (!prompt) {
      return NextResponse.json({
        error: "Prompt is required",
      });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are an expert SaaS startup strategist helping users build successful AI businesses.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const result =
      completion.choices[0].message.content || "No response";

    // SAVE TO SUPABASE
    await supabase.from("generations").insert([
      {
        user_id,
        prompt,
        result,
      },
    ]);

    return NextResponse.json({
      result,
    });
  } catch (error: any) {
    console.error(error);

    return NextResponse.json({
      error: error.message,
    });
  }
}
