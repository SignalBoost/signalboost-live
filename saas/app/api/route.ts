import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json({
        success: false,
        error: "Prompt is required",
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        success: false,
        error: "Missing OPENAI_API_KEY in Vercel.",
      });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are SignalBoost AI. Generate clear startup, website, marketing, and SaaS strategies for users.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    return NextResponse.json({
      success: true,
      result:
        completion.choices[0]?.message?.content ||
        "No response generated.",
    });
  } catch (error: any) {
    console.error("AI_GENERATION_ERROR:", error);

    return NextResponse.json({
      success: false,
      error:
        error?.message ||
        "AI generation failed. Check Vercel logs.",
    });
  }
}
