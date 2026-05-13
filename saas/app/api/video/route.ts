// saas/app/api/video/route.ts

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

    const { prompt, aspect_ratio } = await req.json();

    const finalAspect = aspect_ratio || "9:16";

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });

    // ⭐ Generate video
    const video = await client.videos.generate({
      model: "gpt-4o-mini-tts",
      prompt,
      aspect_ratio: finalAspect,
    });

    // ⭐ Deduct 5 credits for video generation
    await supabase.rpc("deduct_credits", {
      uid: user.id,
      used: 5,
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
