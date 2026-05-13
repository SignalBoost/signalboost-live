// saas/app/api/video/route.ts

import { NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: Request) {
  try {
    const { prompt, aspect_ratio } = await req.json();

    // ⭐ Default to TikTok-style vertical if nothing is provided
    const finalAspect = aspect_ratio || "9:16";

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });

    const video = await client.videos.generate({
      model: "gpt-4o-mini-tts", // replace with your actual video model
      prompt,
      aspect_ratio: finalAspect,
    });

    return NextResponse.json({
      videoUrl: video.url,
      aspect_ratio: finalAspect,
    });
  } catch (error: any) {
    console.error("Video generation error:", error);
    return NextResponse.json(
      { error: "Video generation failed." },
      { status: 500 }
    );
  }
}
